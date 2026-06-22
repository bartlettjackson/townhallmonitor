import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — California Town Hall Monitor",
  description: "How Town Hall Monitor collects, uses, and protects your information.",
};

const PRIVACY_CONTACT = "info@graniteridgestrategies.com";
const LAST_UPDATED = "June 22, 2026";

const sectionStyle: React.CSSProperties = { marginTop: 28 };
const h2Style: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "var(--patriot-blue)",
  margin: "0 0 10px",
};
const pStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "#374151",
  margin: "0 0 12px",
};
const ulStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "#374151",
  margin: "0 0 12px",
  paddingLeft: 22,
};
const linkStyle: React.CSSProperties = {
  color: "var(--patriot-blue)",
  fontWeight: 600,
  textDecoration: "underline",
};

export default function PrivacyPage() {
  return (
    <>
      <div className="rwb-stripe" />
      <div
        style={{
          minHeight: "100vh",
          background: "#F9FAFB",
          padding: "32px 24px 64px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img
              src="/ca-flag.png"
              alt="California Flag"
              width={48}
              height={32}
              style={{
                margin: "0 auto 16px",
                display: "block",
                borderRadius: 4,
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                objectFit: "cover",
              }}
            />
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--patriot-blue)",
                margin: 0,
              }}
            >
              Privacy Policy
            </h1>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>
              Last updated: {LAST_UPDATED}
            </p>
          </div>

          <div className="card" style={{ padding: "32px 32px 36px" }}>
            <p style={pStyle}>
              California Town Hall Monitor (the &ldquo;Service&rdquo;) is operated by{" "}
              <a
                href="https://www.graniteridgestrategies.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                Granite Ridge Strategies
              </a>{" "}
              (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). This
              Privacy Policy explains what information we collect, how we use it,
              and the choices you have. By creating an account or using the
              Service, you agree to the practices described here.
            </p>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Information we collect</h2>
              <ul style={ulStyle}>
                <li>
                  <strong>Account information.</strong> When you register, we
                  collect your name, email address, and a password. Passwords are
                  never stored in plain text&mdash;they are kept only as a salted
                  cryptographic hash.
                </li>
                <li>
                  <strong>Settings you create.</strong> Saved filters and account
                  preferences you configure within the Service.
                </li>
                <li>
                  <strong>Technical and security data.</strong> We process your IP
                  address and basic request metadata to authenticate sessions,
                  enforce rate limits, and protect accounts against abuse such as
                  brute-force login attempts.
                </li>
              </ul>
              <p style={pStyle}>
                The town hall and legislator event information displayed in the
                Service is gathered from publicly available California state
                government websites. It is not personal information about you.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>How we use information</h2>
              <ul style={ulStyle}>
                <li>To create and maintain your account and authenticate you.</li>
                <li>To provide, operate, and improve the Service.</li>
                <li>
                  To secure the Service&mdash;detecting, preventing, and
                  responding to fraud, abuse, or security incidents.
                </li>
                <li>To respond to your requests and communicate with you about the Service.</li>
              </ul>
              <p style={pStyle}>
                We do not sell or share your personal information for advertising,
                and we do not use it for cross-context behavioral advertising.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Cookies</h2>
              <p style={pStyle}>
                We use strictly necessary cookies to keep you signed in and to
                protect against cross-site request forgery. These authentication
                cookies are HTTP-only and are required for the Service to
                function. We do not use advertising or third-party tracking
                cookies.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Service providers</h2>
              <p style={pStyle}>
                We rely on a small number of third parties to operate the Service:
              </p>
              <ul style={ulStyle}>
                <li>
                  <strong>Railway</strong> &mdash; cloud hosting and our managed
                  database, where your account data is stored.
                </li>
                <li>
                  <strong>Anthropic</strong> &mdash; AI processing used to parse
                  public government web pages. Only publicly available government
                  page content is sent for parsing; your personal account
                  information is never sent to Anthropic.
                </li>
              </ul>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Data retention</h2>
              <p style={pStyle}>
                We retain your account information for as long as your account is
                active. If you ask us to delete your account, we will delete your
                personal information except where we are required to retain it to
                comply with legal obligations or to resolve disputes. Limited
                security logs (such as IP addresses used for abuse prevention) are
                kept only as long as needed for those purposes.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Your privacy rights</h2>
              <p style={pStyle}>
                Depending on where you live, including under the California
                Consumer Privacy Act (CCPA/CPRA), you may have the right to:
              </p>
              <ul style={ulStyle}>
                <li>Know what personal information we hold about you;</li>
                <li>Request access to or a copy of that information;</li>
                <li>Request correction of inaccurate information;</li>
                <li>Request deletion of your information; and</li>
                <li>
                  Not be discriminated against for exercising these rights.
                </li>
              </ul>
              <p style={pStyle}>
                To exercise any of these rights, email us at{" "}
                <a href={`mailto:${PRIVACY_CONTACT}`} style={linkStyle}>
                  {PRIVACY_CONTACT}
                </a>
                . We will verify your request using the email associated with your
                account before acting on it.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Security</h2>
              <p style={pStyle}>
                We protect your information with industry-standard measures,
                including encrypted (HTTPS/TLS) connections, hashed passwords,
                HTTP-only authentication cookies, and rate limiting and account
                lockout to deter abuse. No method of transmission or storage is
                100% secure, but we work to safeguard your information.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Children&rsquo;s privacy</h2>
              <p style={pStyle}>
                The Service is intended for government affairs professionals and is
                not directed to children. We do not knowingly collect personal
                information from anyone under 16.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Changes to this policy</h2>
              <p style={pStyle}>
                We may update this Privacy Policy from time to time. When we do, we
                will revise the &ldquo;Last updated&rdquo; date above. Significant
                changes will be communicated through the Service.
              </p>
            </section>

            <section style={sectionStyle}>
              <h2 style={h2Style}>Contact us</h2>
              <p style={pStyle}>
                If you have questions about this Privacy Policy or our handling of
                your information, contact us at{" "}
                <a href={`mailto:${PRIVACY_CONTACT}`} style={linkStyle}>
                  {PRIVACY_CONTACT}
                </a>
                .
              </p>
            </section>
          </div>

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <a href="/" style={linkStyle}>
              &larr; Back to Town Hall Monitor
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
