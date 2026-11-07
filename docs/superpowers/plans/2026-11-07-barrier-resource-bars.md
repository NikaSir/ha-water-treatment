# BARRIER resource bars implementation

1. Share the existing calendar-percentage calculation between the main filter and individual BARRIER rows. Cover distinct durations, calendar boundaries, zero and unknown values.
2. Add three static progress tracks and an explicit selector for the main track. Patch width and ARIA values per stage using the existing status colors.
3. Synchronize beta004 metadata and record beta003 as the published baseline.
4. Build the production bundle, run repository checks and browser acceptance. Inspect narrow-screen light/dark rendering, independent colors and clearing/recovery without remounting.
5. Review the patch and prepare a PR with a preview on synthetic data. Publication is a separate action.
