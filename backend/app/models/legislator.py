from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Legislator(Base):
    __tablename__ = "legislators"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    chamber: Mapped[str] = mapped_column(String(20))  # assembly / senate
    district: Mapped[str] = mapped_column(String(50))
    party: Mapped[str] = mapped_column(String(50))
    official_website: Mapped[str | None] = mapped_column(String(500))
    campaign_website: Mapped[str | None] = mapped_column(String(500))
    facebook_url: Mapped[str | None] = mapped_column(String(500))
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime)
    scrape_status: Mapped[str | None] = mapped_column(String(50))
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    circuit_open_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    events = relationship("Event", back_populates="legislator")
    scrape_logs = relationship("ScrapeLog", back_populates="legislator")
