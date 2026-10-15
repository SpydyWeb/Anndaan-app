import asyncio
from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy.ext.asyncio import create_async_engine

from app import models  # noqa: F401  (registers tables)
from app.config import get_settings
from app.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _include(obj, name, type_, reflected, compare_to):
    # PostGIS ships its own tables (spatial_ref_sys, tiger/topology schemas); ignore them.
    if type_ == "table" and reflected and compare_to is None:
        return False
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


def _configure(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=_include,
        process_revision_directives=alembic_helpers.writer,
        render_item=alembic_helpers.render_item,
        compare_type=True,
    )


def run_offline() -> None:
    context.configure(url=get_settings().database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection):
    _configure(connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    url = config.attributes.get("database_url") or get_settings().database_url
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        await conn.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_online())
