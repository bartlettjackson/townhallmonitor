from dataclasses import dataclass


@dataclass
class EventData:
    title: str
    date: str | None = None
    time: str | None = None
    address: str | None = None
    event_type: str | None = None
    additional_details: str | None = None
    source_url: str | None = None
    is_virtual: bool = False
    raw_html_snippet: str | None = None
