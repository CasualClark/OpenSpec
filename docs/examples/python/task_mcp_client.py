"""
Task MCP HTTP Client - Python Implementation

A comprehensive client for interacting with Task MCP HTTP server
supporting both SSE and NDJSON transports.
"""

import asyncio
import json
import logging
import time
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass
from urllib.parse import urljoin

import aiohttp
import sseclient


@dataclass
class TaskMCPConfig:
    """Configuration for Task MCP client"""

    base_url: str
    auth_token: str
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: float = 1.0
    enable_logging: bool = False


class TaskMCPError(Exception):
    """Custom exception for Task MCP errors"""

    def __init__(self, message: str, code: str = None, details: Dict = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class TaskMCPClient:
    """
    Task MCP HTTP Client for Python

    Supports both Server-Sent Events (SSE) and NDJSON transports.
    """

    def __init__(self, base_url: str, auth_token: str, **kwargs):
        """
        Initialize Task MCP client

        Args:
            base_url: Base URL of the Task MCP server
            auth_token: Authentication token
            **kwargs: Additional configuration options
        """
        self.config = TaskMCPConfig(
            base_url=base_url.rstrip("/"), auth_token=auth_token, **kwargs
        )

        self.session = None
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        """Setup logger for the client"""
        logger = logging.getLogger(__name__)

        if self.config.enable_logging:
            if not logger.handlers:
                handler = logging.StreamHandler()
                formatter = logging.Formatter(
                    "[%(asctime)s] [TaskMCP] %(levelname)s: %(message)s"
                )
                handler.setFormatter(formatter)
                logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        else:
            logger.setLevel(logging.WARNING)

        return logger

    async def __aenter__(self):
        """Async context manager entry"""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()

    async def _ensure_session(self):
        """Ensure aiohttp session exists"""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout)
            self.session = aiohttp.ClientSession(
                timeout=timeout,
                headers={
                    "Authorization": f"Bearer {self.config.auth_token}",
                    "Content-Type": "application/json",
                },
            )

    async def close(self):
        """Close the client and cleanup resources"""
        if self.session and not self.session.closed:
            await self.session.close()
            self.logger.info("Task MCP client closed")

    async def execute_tool_sse(
        self, tool_name: str, input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute tool using Server-Sent Events (SSE)

        Args:
            tool_name: Name of the tool to execute
            input_data: Tool input parameters

        Returns:
            Tool execution result

        Raises:
            TaskMCPError: If execution fails
        """
        await self._ensure_session()

        start_time = time.time()
        last_error = None

        for attempt in range(self.config.retry_attempts):
            try:
                result = await self._execute_sse_request(tool_name, input_data)

                self.logger.info(
                    f"Tool '{tool_name}' executed in {time.time() - start_time:.2f}s"
                )
                return result

            except Exception as error:
                last_error = error
                attempt += 1

                if (
                    attempt >= self.config.retry_attempts
                    or not self._is_retryable_error(error)
                ):
                    raise error

                delay = self.config.retry_delay * (2 ** (attempt - 1))
                self.logger.warning(
                    f"Attempt {attempt} failed, retrying in {delay:.2f}s: {error}"
                )
                await asyncio.sleep(delay)

        raise last_error

    async def execute_tool_ndjson(
        self, tool_name: str, input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute tool using NDJSON transport

        Args:
            tool_name: Name of the tool to execute
            input_data: Tool input parameters

        Returns:
            Tool execution result

        Raises:
            TaskMCPError: If execution fails
        """
        await self._ensure_session()

        start_time = time.time()
        last_error = None

        for attempt in range(self.config.retry_attempts):
            try:
                result = await self._execute_ndjson_request(tool_name, input_data)

                self.logger.info(
                    f"Tool '{tool_name}' executed in {time.time() - start_time:.2f}s"
                )
                return result

            except Exception as error:
                last_error = error
                attempt += 1

                if (
                    attempt >= self.config.retry_attempts
                    or not self._is_retryable_error(error)
                ):
                    raise error

                delay = self.config.retry_delay * (2 ** (attempt - 1))
                self.logger.warning(
                    f"Attempt {attempt} failed, retrying in {delay:.2f}s: {error}"
                )
                await asyncio.sleep(delay)

        raise last_error

    async def _execute_sse_request(
        self, tool_name: str, input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute SSE request"""
        url = urljoin(self.config.base_url, "/sse")
        payload = {"tool": tool_name, "input": input_data, "apiVersion": "1.0.0"}

        headers = {"Accept": "text/event-stream"}

        async with self.session.post(url, json=payload, headers=headers) as response:
            if response.status != 200:
                await self._handle_http_error(response)

            result = None

            # Process SSE stream
            client = sseclient.SSEClient(response)

            async for event in client:
                try:
                    data = json.loads(event.data)

                    if event.event == "result":
                        result = data.get("result")
                    elif event.event == "error":
                        error_info = data.get("error", {})
                        raise TaskMCPError(
                            error_info.get("message", "Tool execution error"),
                            error_info.get("code"),
                            error_info.get("details"),
                        )
                    elif event.event == "heartbeat":
                        # Heartbeat received, connection is alive
                        continue

                except json.JSONDecodeError as e:
                    self.logger.warning(f"Failed to parse SSE data: {e}")
                    continue

            if result is None:
                raise TaskMCPError("No result received from server")

            return result

    async def _execute_ndjson_request(
        self, tool_name: str, input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute NDJSON request"""
        url = urljoin(self.config.base_url, "/mcp")
        payload = {"tool": tool_name, "input": input_data, "apiVersion": "1.0.0"}

        headers = {"Accept": "application/x-ndjson"}

        async with self.session.post(url, json=payload, headers=headers) as response:
            if response.status != 200:
                await self._handle_http_error(response)

            result = None

            # Process NDJSON stream
            async for line in response.content:
                line_str = line.decode("utf-8").strip()

                if line_str:
                    try:
                        event = json.loads(line_str)

                        if event.get("type") == "result":
                            result = event.get("result")
                        elif event.get("type") == "error":
                            error_info = event.get("error", {})
                            raise TaskMCPError(
                                error_info.get("message", "Tool execution error"),
                                error_info.get("code"),
                                error_info.get("details"),
                            )
                        elif event.get("type") == "start":
                            # Request started
                            continue
                        elif event.get("type") == "end":
                            # Request ended
                            break

                    except json.JSONDecodeError as e:
                        self.logger.warning(f"Failed to parse NDJSON line: {line_str}")
                        continue

            if result is None:
                raise TaskMCPError("No result received from server")

            return result

    async def _handle_http_error(self, response: aiohttp.ClientResponse):
        """Handle HTTP error responses"""
        try:
            error_data = await response.json()
            error_info = error_data.get("error", {})

            raise TaskMCPError(
                error_info.get("message", f"HTTP {response.status}"),
                error_info.get("code"),
                error_info.get("details"),
            )
        except (json.JSONDecodeError, aiohttp.ContentTypeError):
            raise TaskMCPError(f"HTTP {response.status}: {response.reason}")

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if error is retryable"""
        retryable_codes = [
            "RATE_LIMIT_EXCEEDED",
            "INTERNAL_ERROR",
            "TIMEOUT",
            "CONNECTION_ERROR",
        ]

        retryable_status_codes = [429, 500, 502, 503, 504]

        if isinstance(error, TaskMCPError):
            return (
                error.code in retryable_codes
                or hasattr(error, "status")
                and error.status in retryable_status_codes
            )

        return (
            isinstance(error, (aiohttp.ClientError, asyncio.TimeoutError))
            or "timeout" in str(error).lower()
            or "connection" in str(error).lower()
        )

    async def health_check(self) -> Dict[str, Any]:
        """
        Perform health check

        Returns:
            Health status information

        Raises:
            TaskMCPError: If health check fails
        """
        await self._ensure_session()

        url = urljoin(self.config.base_url, "/healthz")

        async with self.session.get(url) as response:
            if response.status != 200:
                raise TaskMCPError(f"Health check failed: HTTP {response.status}")

            return await response.json()

    async def get_metrics(self) -> Dict[str, Any]:
        """
        Get server metrics (requires authentication)

        Returns:
            Server metrics

        Raises:
            TaskMCPError: If metrics retrieval fails
        """
        await self._ensure_session()

        url = urljoin(self.config.base_url, "/security/metrics")

        async with self.session.get(url) as response:
            if response.status != 200:
                raise TaskMCPError(f"Failed to get metrics: HTTP {response.status}")

            return await response.json()


class TaskMCPClientExtensions(TaskMCPClient):
    """Extended client with convenience methods"""

    async def create_change(self, title: str, slug: str, **options) -> Dict[str, Any]:
        """
        Create a new change

        Args:
            title: Change title
            slug: Change slug
            **options: Additional options (template, rationale, owner, ttl)

        Returns:
            Creation result
        """
        input_data = {
            "title": title,
            "slug": slug,
            "template": options.get("template", "feature"),
            "rationale": options.get("rationale"),
            "owner": options.get("owner"),
            "ttl": options.get("ttl"),
        }

        return await self.execute_tool_sse("change.open", input_data)

    async def archive_change(self, slug: str) -> Dict[str, Any]:
        """
        Archive a change

        Args:
            slug: Change slug to archive

        Returns:
            Archive result
        """
        return await self.execute_tool_sse("change.archive", {"slug": slug})

    async def get_active_changes(self, **options) -> Dict[str, Any]:
        """
        Get active changes

        Args:
            **options: Query options (limit, offset)

        Returns:
            Active changes
        """
        input_data = {
            "limit": options.get("limit", 50),
            "offset": options.get("offset", 0),
        }

        return await self.execute_tool_sse("changes.active", input_data)

    async def execute_batch(
        self, operations: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple tools concurrently

        Args:
            operations: List of tool operations

        Returns:
            Results array
        """
        tasks = []
        for op in operations:
            task = self.execute_tool_sse(op["tool"], op["input"])
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Convert exceptions to error results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append(
                    {"error": str(result), "operation": operations[i]}
                )
            else:
                processed_results.append(result)

        return processed_results


# Example usage
async def example():
    """Example usage of Task MCP client"""
    client = TaskMCPClientExtensions(
        base_url="http://localhost:8443",
        auth_token="your-auth-token",
        enable_logging=True,
    )

    try:
        async with client:
            # Health check
            print("Checking server health...")
            health = await client.health_check()
            print(f"Health status: {health}")

            # Create a change
            print("\nCreating a change...")
            change = await client.create_change(
                title="Example Change",
                slug="example-change",
                template="feature",
                rationale="Example change for demonstration",
            )
            print(f"Change created: {change}")

            # Get active changes
            print("\nGetting active changes...")
            changes = await client.get_active_changes()
            print(f"Active changes: {changes}")

            # Archive the change
            print("\nArchiving change...")
            await client.archive_change("example-change")
            print("Change archived")

    except TaskMCPError as error:
        print(f"Error: {error}")
        if error.details:
            print(f"Details: {error.details}")
    except Exception as error:
        print(f"Unexpected error: {error}")


if __name__ == "__main__":
    # Run example
    asyncio.run(example())
