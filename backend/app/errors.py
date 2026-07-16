class AssistantServiceError(Exception):
    status_code = 503
    code = "assistant_service_unavailable"
    public_message = "Assistant service is temporarily unavailable"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.public_message)


class KpiDataError(AssistantServiceError):
    code = "kpi_data_unavailable"
    public_message = "KPI data is temporarily unavailable"


class McpToolError(AssistantServiceError):
    code = "mcp_tool_failed"
    public_message = "KPI tool execution failed"


class LlmServiceError(AssistantServiceError):
    code = "llm_service_unavailable"
    public_message = "AI generation is temporarily unavailable"
