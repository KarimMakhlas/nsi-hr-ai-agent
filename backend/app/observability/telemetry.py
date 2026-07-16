import os

from opentelemetry import metrics, trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
    OTLPMetricExporter,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter,
)

from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup_telemetry(app):
    if os.getenv("NSI_TELEMETRY_DISABLED") == "1":
        return

    resource = Resource.create(
        {
            "service.name": "nsi-hr-ai-business-case",
            "service.version": "1.0.0",
        }
    )

    # Send traces to Aspire Dashboard
    trace_exporter = OTLPSpanExporter(
        endpoint="http://localhost:4318/v1/traces"
    )

    trace_provider = TracerProvider(resource=resource)
    trace_provider.add_span_processor(
        BatchSpanProcessor(trace_exporter)
    )

    trace.set_tracer_provider(trace_provider)

    # Send metrics to Aspire Dashboard
    metric_exporter = OTLPMetricExporter(
        endpoint="http://localhost:4318/v1/metrics"
    )

    metric_reader = PeriodicExportingMetricReader(
        metric_exporter,
        export_interval_millis=5000,
    )

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[metric_reader],
    )

    metrics.set_meter_provider(meter_provider)

    # Automatically trace FastAPI requests
    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="health",
        exclude_spans=["send", "receive"],
    )
