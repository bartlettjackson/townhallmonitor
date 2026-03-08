from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScrapeLog(Base):
    __tablename__ = "scrape_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    legislator_id: Mapped[int] = mapped_column(ForeignKey("legislators.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(50))  # success / failed / no_events
    error_message: Mapped[str | None] = mapped_column(Text)
    method_used: Mapped[str | None] = mapped_column(String(50))  # pattern / ai

    legislator = relationship("Legislator", back_populates="scrape_logs")
