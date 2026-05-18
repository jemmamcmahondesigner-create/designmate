# ArtifactPreview — DS Component + Product Implementation

Two phases: (1) install the DS component, (2) wire it into three workflows.
Run `npx tsc --noEmit` after completing all phases.

---

## PHASE 1 — Install ArtifactPreview into the DS package

Copy `ArtifactPreview.tsx` and `ArtifactPreview.module.css` into 
`components/ui/ds/`.

Add to `components/ui/ds/index.ts`:

```ts
export { ArtifactPreview } from './ArtifactPreview';
export type {
  ArtifactPreviewProps,
  ArtifactPreviewSize,
  ArtifactPreviewFileType,
  ArtifactPreviewMode,
} from './ArtifactPreview';
```

---

## PHASE 2 — Workflow 1: Create Review Drawer

### 2a. Where to add it

In the Create Review drawer, Step 1 currently has: title, type, and a 
section for the artifact. ArtifactPreview belongs in Step 1, immediately 
after the user uploads/links an artifact file.

The trigger flow is:
1. User clicks "+ Upload artifact" or a Figma link button
2. File is selected / URL pasted
3. ArtifactPreview replaces the upload placeholder — inline editable mode
4. User names the artifact and selects an iteration before proceeding

### 2b. State to manage in the Create Review drawer

```tsx
// In your Create Review drawer component
const [artifact, setArtifact] = useState<{
  file: File | null;
  figmaUrl: string;
  fileName: string;
  fileType: 'figma' | 'pdf';
  name: string;
  iteration: string;
  description: string;
} | null>(null);
```

### 2c. Upload handler

```tsx
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const fileType = file.type === 'application/pdf' ? 'pdf' : 'figma';
  setArtifact({
    file,
    figmaUrl: '',
    fileName: file.name,
    fileType,
    name: '',
    iteration: '',
    description: '',
  });
};
```

### 2d. ArtifactPreview in Step 1

Replace the upload placeholder (or the empty artifact zone) with:

```tsx
import { ArtifactPreview } from '@/components/ui/ds';

{/* Step 1 — only show once artifact is uploaded */}
{artifact ? (
  <ArtifactPreview
    size="large"
    fileType={artifact.fileType}
    mode="editable"
    showDetails={true}
    fileName={artifact.fileName}
    lastEdited="Just now"
    artifactName={artifact.name}
    iteration={artifact.iteration}
    description={artifact.description}
    iterationOptions={['Iteration 1', 'Iteration 2', 'Iteration 3']}
    onArtifactNameChange={name => setArtifact(prev => prev ? { ...prev, name } : null)}
    onIterationChange={iteration => setArtifact(prev => prev ? { ...prev, iteration } : null)}
    onDescriptionChange={description => setArtifact(prev => prev ? { ...prev, description } : null)}
    onMinimise={() => setArtifact(null)}  // remove artifact
  />
) : (
  <div className={styles.uploadZone}>
    <label>
      <input type="file" accept=".pdf,.fig" onChange={handleFileUpload} hidden />
      <span>+ Upload artifact</span>
    </label>
  </div>
)}
```

### 2e. Pass artifact data through to review creation

When the drawer form submits, include artifact data:

```tsx
const reviewPayload = {
  title,
  type,
  artifact: artifact ? {
    fileName: artifact.fileName,
    fileType: artifact.fileType,
    name: artifact.name,
    iteration: artifact.iteration,
    description: artifact.description,
    // file blob or figmaUrl for actual storage
  } : null,
};
```

---

## PHASE 3 — Workflow 2: View Review

When a review is opened (e.g. clicking a ReviewCard opens a drawer or 
detail page), the artifact is shown in read-only mode.

```tsx
{review.artifact && (
  <ArtifactPreview
    size="large"
    fileType={review.artifact.fileType}
    mode="readonly"
    showDetails={true}
    fileName={review.artifact.fileName}
    lastEdited={review.artifact.updatedAt 
      ? `Edited ${formatRelativeTime(review.artifact.updatedAt)}`
      : undefined}
    artifactName={review.artifact.name}
    iteration={review.artifact.iteration}
    description={review.artifact.description}
    // No callbacks needed — readonly
  />
)}
```

If the review has no artifact:
```tsx
{!review.artifact && (
  <p className={styles.noArtifact}>No artifact attached to this review.</p>
)}
```

---

## PHASE 4 — Workflow 3: Create Decision (scaffold for future)

The Create Decision workflow doesn't exist yet in the product. When you 
build it, the ArtifactPreview wiring follows the same pattern as Create 
Review (Phase 2):

- Step includes an artifact upload zone
- On upload → shows `mode="editable"` ArtifactPreview
- Decision payload includes the artifact object

No code to write for this phase yet — documented here for when you build it.

---

## PHASE 5 — Iteration data

The iteration select in the editable footer needs real data. Iterations 
should come from the project context (the project the review belongs to).

In the Create Review drawer, fetch iterations for the selected project:

```tsx
// When project is selected in Step 1:
const { data: iterations } = useQuery({
  queryKey: ['iterations', selectedProjectId],
  queryFn: () => supabase
    .from('iterations')
    .select('id, name')
    .eq('project_id', selectedProjectId)
    .order('created_at'),
  enabled: !!selectedProjectId,
});

const iterationOptions = iterations?.data?.map(i => i.name) ?? ['Iteration 1'];
```

Pass these as `iterationOptions` to ArtifactPreview.

If no iterations table exists yet in Supabase, default to 
`['Iteration 1', 'Iteration 2', 'Iteration 3']` as static options for now.

---

## PHASE 6 — Preview area: real artifact display

The ArtifactPreview's preview area currently shows a pink placeholder 
(`background: #ffcece`). For MVP, replace with:

**For PDF files:** Use a PDF embed or thumbnail
```tsx
// In ArtifactPreview.tsx, inside the previewImage div:
{fileUrl && fileType === 'pdf' ? (
  <iframe 
    src={fileUrl} 
    className={styles.pdfEmbed}
    title={fileName}
    aria-label={`PDF preview of ${fileName}`}
  />
) : fileType === 'figma' && figmaUrl ? (
  <iframe
    src={`https://www.figma.com/embed?embed_host=designmate&url=${encodeURIComponent(figmaUrl)}`}
    className={styles.figmaEmbed}
    title={fileName}
    allowFullScreen
  />
) : (
  <div className={styles.emptyPreview}>
    <span>Preview unavailable</span>
  </div>
)}
```

Add `fileUrl?: string` and `figmaUrl?: string` to ArtifactPreviewProps for 
this to work. For MVP, the pink placeholder is acceptable — replace when 
file storage/embedding is wired up.

---

## After all phases

1. `npx tsc --noEmit` — fix all errors
2. Pause OneDrive, clear `.next`, restart dev
3. Test Create Review: upload a file → ArtifactPreview appears → fill in 
   name/iteration/description → submit → review card shows in project detail
4. Test View Review: click a review card → drawer/detail shows read-only 
   ArtifactPreview
