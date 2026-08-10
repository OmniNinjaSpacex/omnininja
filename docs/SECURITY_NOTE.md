# Security note

OmniNinja reads OpenAI and Browserless credentials only from server-side environment variables. Never commit real credentials.

If a credential has ever been pasted into chat, a screenshot, a public issue, logs, or source code, rotate/revoke it in the provider dashboard and replace the deployment secret with the new value.
