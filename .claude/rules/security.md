# Security

<critical>
- NEVER hardcode API keys, tokens, or passwords in source code
- ALWAYS load credentials from environment variables or a key manager
- NEVER commit `.env` files, credential files, or key files
- NEVER log or print API keys/tokens (even partially)
- If a key appears in output, warn the user immediately
</critical>

<rules name="file-safety">
<rule>NEVER commit files matching: `.env`, `*.pem`, `*.key`, `credentials.*`, `secrets.*`</rule>
<rule>Check `git diff --cached` for accidental secret inclusion before committing</rule>
<rule>Temp output files go to `/tmp/` — never committed to the project root</rule>
</rules>
