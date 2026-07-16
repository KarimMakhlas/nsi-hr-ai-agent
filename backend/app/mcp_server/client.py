import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from backend.app.errors import McpToolError

from opentelemetry import metrics


meter = metrics.get_meter("nsi-hr-mcp")

mcp_tool_calls_counter = meter.create_counter(
    "mcp_tool_calls_total",
    description="Number of MCP tool calls",
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SERVER_SCRIPT = PROJECT_ROOT / "backend" / "app" / "mcp_server" / "server.py"


async def call_mcp_tool(tool_name: str, arguments: dict | None = None) -> Any:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_ROOT)

    server_params = StdioServerParameters(
        command=sys.executable,
        args=[str(SERVER_SCRIPT)],
        env=env,
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            result = await session.call_tool(
                tool_name,
                arguments=arguments or {},
            )

            if result.isError or not result.content:
                raise McpToolError(f"MCP tool '{tool_name}' failed")

            text_result = result.content[0].text

            try:
                return json.loads(text_result)
            except json.JSONDecodeError:
                return text_result


def call_mcp_tool_sync(tool_name: str, arguments: dict | None = None) -> Any:
    mcp_tool_calls_counter.add(
        1,
        attributes={"tool.name": tool_name}
    )

    try:
        return asyncio.run(call_mcp_tool(tool_name, arguments))
    except McpToolError:
        raise
    except Exception as exc:
        raise McpToolError(f"MCP tool '{tool_name}' failed: {exc}") from exc
