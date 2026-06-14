"""Base scraper with shared HTTP/Playwright fetching, rate limiting, and structure."""

import asyncio
import logging
import ssl
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import urlsplit

import certifi
import httpx
from playwright.async_api import Browser, async_playwright

from app.scraper.event_data import EventData

logger = logging.getLogger(__name__)

# asmdc.org serves a BROKEN certificate chain — it presents the wrong
# intermediate, so the chain to a trusted root can't be built and standard TLS
# verification fails. Rather than disable verification, we supply the correct
# intermediate ("Entrust DV TLS Issuing RSA CA 2", chains to a certifi root)
# and verify against certifi roots + that cert. Full verification — including
# hostname and expiry — stays ON. Matches the domain and its subdomains.
# (asmrc.org needs nothing special: it verifies fine against the standard bundle.)
CUSTOM_CA_SUFFIXES = ("asmdc.org",)
ASMDC_CA_BUNDLE = Path(__file__).resolve().parent / "certs" / "entrust_dv_tls_issuing_rsa_ca2.pem"

USER_AGENT = (
    "CA-TownHall-Monitor/1.0 "
    "(civic data collection; contact: github.com/bartlettjackson/ca-townhall-tracker)"
)
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.0  # seconds: 1, 2, 4
RATE_LIMIT_SECONDS = 2.0

EVENT_PATHS = [
    "/events",
    "/district/events",
    "/town-hall",
    "/town-halls",
    "/calendar",
    "/community-events",
]

# If a page body has fewer characters than this after stripping tags,
# it's likely JS-rendered and we should retry with Playwright.
MIN_BODY_LENGTH = 500


class BaseScraper(ABC):
    """Abstract base for all site-specific scrapers."""

    name: str = "base"

    def __init__(self):
        self._http_client: httpx.AsyncClient | None = None
        self._http_client_asmdc: httpx.AsyncClient | None = None
        self._browser: Browser | None = None
        self._pw_context_manager = None
        self._last_request_at: float = 0.0
        self._last_final_url: str | None = None
        self._dns_failed: bool = False

    # -- resource management --------------------------------------------------

    @staticmethod
    def _needs_custom_ca(url: str) -> bool:
        """Whether this URL needs the vendored intermediate to verify (asmdc.org)."""
        host = (urlsplit(url).hostname or "").lower()
        return any(host == d or host.endswith("." + d) for d in CUSTOM_CA_SUFFIXES)

    @staticmethod
    def _build_asmdc_ssl_context() -> ssl.SSLContext:
        """certifi roots + the correct asmdc.org intermediate. Verification stays ON."""
        ctx = ssl.create_default_context(cafile=certifi.where())
        ctx.load_verify_locations(cafile=str(ASMDC_CA_BUNDLE))
        return ctx

    async def _get_http_client(self, url: str) -> httpx.AsyncClient:
        # asmdc.org needs the vendored intermediate added to the trust store;
        # every other host uses the default certifi bundle. Both verify fully.
        if self._needs_custom_ca(url):
            if self._http_client_asmdc is None:
                self._http_client_asmdc = httpx.AsyncClient(
                    headers={"User-Agent": USER_AGENT},
                    timeout=REQUEST_TIMEOUT,
                    follow_redirects=True,
                    verify=self._build_asmdc_ssl_context(),
                )
            return self._http_client_asmdc

        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
                verify=True,
            )
        return self._http_client

    async def _get_browser(self) -> Browser:
        if self._browser is None:
            self._pw_context_manager = async_playwright()
            pw = await self._pw_context_manager.start()
            self._browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-extensions",
                    "--no-sandbox",
                    "--js-flags=--max-old-space-size=128",
                ],
            )
        return self._browser

    async def close(self):
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        if self._http_client_asmdc:
            await self._http_client_asmdc.aclose()
            self._http_client_asmdc = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._pw_context_manager:
            await self._pw_context_manager.__aexit__(None, None, None)
            self._pw_context_manager = None

    # -- fetching --------------------------------------------------------------

    async def _rate_limit(self):
        now = asyncio.get_event_loop().time()
        wait = RATE_LIMIT_SECONDS - (now - self._last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_request_at = asyncio.get_event_loop().time()

    async def _fetch_with_retry(self, url: str) -> httpx.Response | None:
        """HTTP GET with retry on 5xx / timeout errors.

        Returns the Response on success, or None if all retries exhausted.
        Non-retryable errors (4xx, DNS failures, other HTTP errors) return None immediately.
        """
        client = await self._get_http_client(url)
        last_exc: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = await client.get(url)
                if resp.status_code < 500:
                    return resp  # success or 4xx — don't retry
                # 5xx — retryable
                logger.warning(
                    "Retry %d/%d: %s returned HTTP %s",
                    attempt,
                    MAX_RETRIES,
                    url,
                    resp.status_code,
                )
            except httpx.ConnectError as exc:
                exc_str = str(exc)
                # DNS failures are permanent — don't retry
                if "Name or service not known" in exc_str or "nodename nor servname" in exc_str:
                    logger.warning("DNS resolution failed for %s: %s", url, exc)
                    self._dns_failed = True
                    return None
                logger.warning(
                    "Retry %d/%d: %s failed (%s: %s)",
                    attempt,
                    MAX_RETRIES,
                    url,
                    type(exc).__name__,
                    exc,
                )
                last_exc = exc
            except httpx.TimeoutException as exc:
                logger.warning(
                    "Retry %d/%d: %s failed (%s: %s)",
                    attempt,
                    MAX_RETRIES,
                    url,
                    type(exc).__name__,
                    exc,
                )
                last_exc = exc
            except httpx.HTTPError as exc:
                # Non-retryable HTTP error
                logger.warning("HTTP error fetching %s: %s", url, exc)
                return None

            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                await asyncio.sleep(wait)

        if last_exc:
            logger.warning("All %d retries exhausted for %s: %s", MAX_RETRIES, url, last_exc)
        return None

    async def fetch_page(self, url: str, use_playwright: bool = False) -> str | None:
        """Fetch a URL. Returns HTML string or None on failure.

        Also returns the final URL after redirects via self._last_final_url.
        """
        await self._rate_limit()
        self._last_final_url: str | None = None

        if use_playwright:
            return await self._fetch_with_playwright(url)

        resp = await self._fetch_with_retry(url)

        if resp is None:
            logger.info("HTTP retries exhausted for %s, skipping (Playwright disabled)", url)
            return None

        # Track final URL after redirects
        self._last_final_url = str(resp.url)

        if resp.status_code >= 400:
            logger.info("fetch_page: %s returned HTTP %s", url, resp.status_code)
            return None

        html = resp.text
        # If the body looks suspiciously thin, the real content is probably
        # rendered client-side — fall back to Playwright.
        if len(html) < MIN_BODY_LENGTH:
            logger.info("fetch_page: %s body too short (%d chars), skipping", url, len(html))
            return None
        return html

    async def _fetch_with_playwright(self, url: str) -> str | None:
        try:
            browser = await self._get_browser()
            page = await browser.new_page(user_agent=USER_AGENT)
            try:
                await page.goto(
                    url, timeout=int(REQUEST_TIMEOUT * 1000), wait_until="domcontentloaded"
                )
                # Give JS a moment to render dynamic content
                await page.wait_for_timeout(2000)
                return await page.content()
            finally:
                await page.close()
        except Exception as exc:
            logger.warning("Playwright failed for %s: %s", url, exc)
            return None

    # -- extraction (subclasses implement) -------------------------------------

    @abstractmethod
    async def extract_events(self, html: str, url: str) -> list[EventData]:
        """Parse HTML and return structured event data."""
        ...

    # -- helpers ---------------------------------------------------------------

    def _event_page_urls(self, base_url: str) -> list[str]:
        """Generate candidate event page URLs from a base site URL."""
        base = base_url.rstrip("/")
        return [f"{base}{path}" for path in EVENT_PATHS]

    @staticmethod
    def _detect_virtual(text: str) -> bool:
        t = text.lower()
        return any(
            kw in t
            for kw in ("zoom", "virtual", "webinar", "online event", "livestream", "tele-town")
        )

    @staticmethod
    def _snippet(element, max_len: int = 2000) -> str:
        raw = str(element)
        return raw[:max_len]

    def check_url_redirect(self, original_url: str) -> str | None:
        """Compare the final URL domain with the requested URL domain.

        Returns the final URL if the domain changed, None otherwise.
        """
        if not self._last_final_url:
            return None
        from urllib.parse import urlparse

        orig_domain = urlparse(original_url).netloc.lower()
        final_domain = urlparse(self._last_final_url).netloc.lower()
        if orig_domain != final_domain:
            logger.warning(
                "URL redirect detected: %s → %s (domain changed: %s → %s)",
                original_url,
                self._last_final_url,
                orig_domain,
                final_domain,
            )
            return self._last_final_url
        return None

    # -- main entry point ------------------------------------------------------

    async def run(self, base_url: str) -> list[EventData]:
        """Try each candidate event path and return events from the first that yields results."""
        all_events: list[EventData] = []
        self._dns_failed = False
        for url in self._event_page_urls(base_url):
            html = await self.fetch_page(url)
            if self._dns_failed:
                logger.info(
                    "%s: all 5 paths returned no usable HTML for %s",
                    self.name,
                    base_url,
                )
                break  # domain doesn't resolve — skip remaining paths
            if html is None:
                continue
            events = await self.extract_events(html, url)
            if events:
                all_events.extend(events)
                break  # found events on this path, stop trying others
        return all_events
