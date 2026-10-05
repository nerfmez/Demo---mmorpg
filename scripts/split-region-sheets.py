"""Rebuild current shared Atlas journal batches (monsters and regions)."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name("split-atlas-journal.py")), run_name="__main__")
