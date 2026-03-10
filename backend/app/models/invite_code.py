from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True)
    code_hash = Column(String(255), unique=True, nullable=False)
    max_uses = Column(Integer, nullable=False, default=1)
    times_used = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, nullable=True)  # user_id of admin who created it
