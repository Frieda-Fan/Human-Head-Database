# Human-Head-Database

Human head OBJ model measurement tool.

## Project Structure

- `web/index.html` - Website entry page with the two product modules.
- `web/modules/generate/` - Parametric head OBJ generator module.
- `web/modules/measure/` - Head OBJ measurement module.
- `web/shared/` - Shared UI styles and browser components used across modules.
- `web/generate/` and `web/measure/` - Compatibility entry points for old local links.
- `web/api/` - Lightweight API helpers used by the measurement module.
- `models/` - Sample OBJ/MTL head models used for local testing.
- `scripts/` - Analysis and visualization utilities.
- `flask_server.py` - Optional Flask entry point.
- `web_server.py` - Local static server with `/`, `/measure`, and `/generate` route support.

Generated files such as `output/`, `*.log`, and other temporary artifacts are ignored by Git and should not be committed.
