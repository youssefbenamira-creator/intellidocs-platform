from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ARRAY, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from database import Base


class ScrapingMode(str, enum.Enum):
    ONE_TIME = "ONE_TIME"
    CONTINUOUS = "CONTINUOUS"


class ScrapingStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ScrapingJob(Base):
    __tablename__ = "ScrapingJob"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    createdById = Column(Integer, nullable=False)
    url = Column(String, nullable=True)
    targetCoins = Column(ARRAY(String), nullable=True)
    attributes = Column(ARRAY(String), nullable=True)
    mode = Column(Enum(ScrapingMode, name="ScrapingMode"), nullable=False)
    intervalSeconds = Column(Integer, nullable=True)
    status = Column(Enum(ScrapingStatus, name="ScrapingStatus"), default=ScrapingStatus.ACTIVE)
    lastRunAt = Column(DateTime(timezone=True), nullable=True)
    templateId = Column(String, nullable=True)
    tableColumns = Column(ARRAY(String), nullable=True, default=list)
    createdAt = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    results = relationship("ScrapingResult", back_populates="job", cascade="all, delete")
    documents = relationship("ScrapedDocument", back_populates="job", cascade="all, delete")


class ScrapingResult(Base):
    __tablename__ = "ScrapingResult"

    id = Column(Integer, primary_key=True, index=True)
    jobId = Column(Integer, ForeignKey("ScrapingJob.id", ondelete="CASCADE"), nullable=False)
    coin = Column(String, nullable=False)
    rank = Column(Integer, nullable=True)
    price = Column(Float, nullable=True)
    marketCap = Column(Float, nullable=True)
    volume24h = Column(Float, nullable=True)
    percentChange24h = Column(Float, nullable=True)
    circulatingSupply = Column(Float, nullable=True)
    scrapedAt = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    job = relationship("ScrapingJob", back_populates="results")


class ScrapedDocument(Base):
    __tablename__ = "ScrapedDocument"

    id = Column(Integer, primary_key=True, index=True)
    jobId = Column(Integer, ForeignKey("ScrapingJob.id", ondelete="CASCADE"), nullable=False)
    url = Column(String, nullable=False)
    title = Column(String, nullable=True)
    description = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    entities = Column(JSONB, nullable=True)
    keywords = Column(ARRAY(String), nullable=True, default=list)
    tables = Column(JSONB, nullable=True)
    templateId = Column(String, nullable=True)
    tableColumns = Column(ARRAY(String), nullable=True, default=list)
    scrapedAt = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    job = relationship("ScrapingJob", back_populates="documents")
