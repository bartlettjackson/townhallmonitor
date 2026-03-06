from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    legislator_id: Mapped[int] = mapped_column(ForeignKey("legislators.id"))
    title: Mapped[str] = mapped_column(String(500))
    date: Mapped[str | None] = mapped_column(String(50))
    time: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(500))
    event_type: Mapped[str | None] = mapped_column(String(100))
    additional_details: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_html_snippet: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    legislator = relationship("Legislator", back_populates="events")
