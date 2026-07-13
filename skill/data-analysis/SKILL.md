---
name: data-analysis
description: "Use when the user wants to analyze data or make charts — explore a table/spreadsheet, find trends, or produce plots and statistics."
---

# Data Analysis & Visualization Guide

*Operation manual for an agent that analyses tabular data and produces charts in a sandboxed Python environment.*

## Environment

The execution sandbox runs **Python 3.14** with these libraries preinstalled:

- **pandas** -- data loading and wrangling
- **numpy** -- numerics
- **seaborn** -- primary visualization library (built on matplotlib)
- **matplotlib** -- backend for rendering and saving figures
- **scipy** -- statistical tests (`scipy.stats`)
- **statsmodels** -- regression, time series, statistical models
- **scikit-learn** -- machine learning, clustering, preprocessing
- **plotly** -- interactive charts
- **openpyxl** -- Excel I/O backend for pandas
- **pyarrow** -- Parquet/Arrow file I/O
- **Pillow** -- image I/O

No network access. No `pip install` at runtime. Everything above is available; anything else is not.

**Note**: If the request is really about producing a formatted Excel deliverable rather than analysis/charts, tell the user to invoke the `xlsx` skill instead (its instructions aren't loaded here).

## File Upload Validation

If the file is visible in chat context, use it directly. Only invoke the code interpreter when it is strictly required to perform the user's request. If the code interpreter is required and the file isn't in the sandbox, reply with EXACTLY this message and stop:

> **I can see your file, but the code interpreter can't access it.** Please re-upload it using the **"Upload for Code Interpreter"** option so the Agent can treat it correctly.

## Mandatory Boilerplate

There is no display server in the sandbox. Every script must start with:

```python
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
```

## Visualization Defaults

- Use **seaborn** for all plots. Fall back to raw matplotlib only for layout control (`subplots`, `savefig`).
- Set a clean theme once at the top: `sns.set_theme(style="whitegrid", context="notebook")`
- Save every figure with `fig.savefig("name.png", dpi=150, bbox_inches="tight")`
- Close every figure immediately after saving: `plt.close(fig)`

## Important Rules

- **`matplotlib.use("Agg")` must come before any pyplot import** -- otherwise the script crashes in the headless sandbox.
- **Always close figures** (`plt.close(fig)`) -- open figures leak memory, especially in loops.
- **Use `bbox_inches="tight"`** when saving -- prevents clipped labels.
- **Use `fig.tight_layout()`** on multi-panel figures -- prevents subplot overlap.
- **Pass `numeric_only=True`** to `.corr()`, `.mean()`, etc. on mixed DataFrames.
- **Sample large datasets before heavy plots** -- `pairplot` and `jointplot` on >5k rows is very slow; sample with `df.sample(n=5000, random_state=42)` first.
- **Prefer the explicit `fig, ax` API** over the stateful `plt.*` interface -- avoids cross-figure state bugs when generating multiple plots.
- **Rotate tick labels** when there are many categories: `ax.tick_params(axis="x", rotation=45)` or use horizontal orientation.

## Verification Disclaimer

Statistical results (p-values, correlations, regressions) and AI-generated interpretations should be treated as preliminary. Always recommend that the user verify findings independently, especially before making decisions based on them.
