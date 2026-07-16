import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.mcp_server.client import call_mcp_tool_sync


def print_section(title: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def main() -> None:
    print_section("MCP tool: get_hr_kpi_summary")
    summary = call_mcp_tool_sync("get_hr_kpi_summary")
    print("period:", summary["period"])
    print("source:", summary["source"])
    print("candidates_contacted:", summary["candidates_contacted"])
    print("total_interviews:", summary["total_interviews"])
    print("client_presentations:", summary["client_presentations"])
    print("total_recruitments:", summary["total_recruitments"])
    print("signature_rate:", summary["signature_rate"])

    print_section("MCP tool: get_kpis_by_recruiter")
    by_recruiter = call_mcp_tool_sync("get_kpis_by_recruiter")

    for name, kpis in by_recruiter["recruiters"].items():
        print(
            f"{name}: "
            f"{kpis['candidates_contacted']} contacted, "
            f"{kpis['total_interviews']} interviews, "
            f"{kpis['client_presentations']} client presentations, "
            f"{kpis['total_recruitments']} recruitments"
        )


if __name__ == "__main__":
    main()
