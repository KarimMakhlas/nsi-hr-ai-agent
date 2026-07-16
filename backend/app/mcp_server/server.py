import json
from mcp.server.fastmcp import FastMCP
from backend.app.services.kpi_service import (
    get_kpi_summary,
    get_kpis_by_recruiter as get_kpis_by_recruiter_service,
)


import os
from dotenv import load_dotenv
from tavily import TavilyClient

load_dotenv()


mcp = FastMCP("nsi-hr-kpi-tools")


@mcp.tool()
def get_hr_kpi_summary() -> str:
    """
    Return the HR KPI summary for Q3 2024.
    The KPIs are calculated from the Excel file by the Python KPI service.
    """
    summary = get_kpi_summary()
    return json.dumps(summary, ensure_ascii=False)


@mcp.tool()
def get_hr_kpi_rates() -> str:
    """
    Return only the HR conversion rates for Q3 2024.
    """
    summary = get_kpi_summary()

    rates = {
        "period": summary["period"],
        "client_presentation_rate": summary["client_presentation_rate"],
        "signature_rate": summary["signature_rate"],
    }

    return json.dumps(rates, ensure_ascii=False)


@mcp.tool()
def get_kpis_by_recruiter() -> str:
    """
    Return HR KPIs by recruiter for Q3 2024.
    """
    data = get_kpis_by_recruiter_service()
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def web_search(query: str) -> str:
    """
    Real web search tool using Tavily.
    This tool is used by the Web Agent to retrieve external context.
    """
    api_key = os.getenv("TAVILY_API_KEY")

    if not api_key:
        error_result = {
            "query": query,
            "error": "TAVILY_API_KEY is missing. Add it to your .env file.",
            "results": []
        }
        return json.dumps(error_result, ensure_ascii=False)

    client = TavilyClient(api_key=api_key)

    response = client.search(
        query=query,
        search_depth="basic",
        max_results=5,
        include_answer=True,
        timeout=15,
    )

    simplified_results = {
        "query": query,
        "answer": response.get("answer"),
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": item.get("content"),
            }
            for item in response.get("results", [])
        ],
    }

    return json.dumps(simplified_results, ensure_ascii=False)


if __name__ == "__main__":
    mcp.run(transport="stdio")
