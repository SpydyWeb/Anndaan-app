import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditLog


def audit(
    session: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | str | None,
    actor_id: uuid.UUID | None = None,
    ip: str | None = None,
    **meta,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            meta={k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in meta.items()},
            ip=ip,
        )
    )
