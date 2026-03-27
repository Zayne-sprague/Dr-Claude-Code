# Adding a Visualizer

The dashboard is a HuggingFace Space with a FastAPI backend and a React frontend. New visualization tabs follow a consistent pattern — copy an existing one and adjust.

## 1. Create the Backend Blueprint

Copy an existing blueprint and rename it:

```bash
cp backend/api/model_datasets.py backend/api/my_datasets.py
```

Open the new file and adjust:

- Rename the `router` prefix (e.g., `/api/my-datasets`)
- Update the endpoint functions to fetch the data you want to display
- Return a consistent JSON schema that your frontend component will consume

Keep endpoints simple — one for listing datasets, one for fetching a specific dataset's rows or metadata.

## 2. Register in `backend/app.py`

```python
from backend.api import my_datasets

app.include_router(my_datasets.router)
```

Add it alongside the existing routers. Order doesn't matter.

## 3. Create the Frontend App

Copy an existing frontend module and rename it:

```bash
cp -r frontend/src/model/ frontend/src/my-view/
```

Inside the new directory:

- Rename the top-level component (e.g., `MyView.tsx`)
- Update the API calls to hit your new backend endpoints
- Adjust the display logic — use the existing `TableViewer`, `PlotlyViewer`, `ImageViewer`, or `YAMLViewer` components rather than building from scratch

## 4. Add the Tab to `VisualizerApp.tsx`

```tsx
// frontend/src/visualizer/VisualizerApp.tsx

import MyView from '../my-view/MyView';

// In the tabs array:
{ id: 'my-view', label: 'My View', component: <MyView /> }
```

The tab will appear in the navigation bar automatically.

## 5. Build and Push

```bash
npm run build
```

Then push to the HF Space:

```bash
git add -A && git commit -m "feat: add my-view tab"
git push space main
```

The Space rebuilds automatically. Check the build logs in the HF Space settings if the deployment fails.

## Tips

- **Reuse viewer components** — `TableViewer`, `PlotlyViewer`, `ImageViewer`, and `YAMLViewer` handle most display cases. Don't build custom renderers unless necessary.
- **Keep backend endpoints thin** — do data transformation in the backend, not the frontend.
- **Test locally first** — run `uvicorn backend.app:app --reload` and `npm run dev` before pushing to the Space.
- **Dashboard sync** — after adding a new tab, run `/sync-dashboard` to confirm the new endpoint is reachable from the live Space.
