'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Divider,
  Icon,
  Menu,
  SelectField,
  StatusPill,
  Tag,
  Textarea,
  Tooltip,
} from '@/components/ui/ds';
import { ChangeRequestModal } from '@/app/reviews/[reviewId]/ChangeRequestModal';
import {
  submitDecisionAction,
  type DecisionStatus,
} from '@/lib/actions/submitDecision';

export type DecisionChangeRequestRow = {
  artifactIds: string[];
  changesNeeded: string;
  /** Pre-loaded from an approved direction — not removable in edit mode. */
  isExisting?: boolean;
};

interface FinalDecisionDrawerProps {
  open: boolean;
  onClose: () => void;
  reviewId: string;
  reviewType: 'approve' | 'compare' | 'align' | 'critique';
  reviewFocus: string;
  artifacts: Array<{
    id: string;
    title: string;
    iterationLabel?: string;
  }>;
  onDecisionSubmitted: () => void;
  currentContributorId: string | null;
  /** Pre-fill when changing an approved compare direction. */
  initialComments?: string;
  initialSelectedIds?: string[];
  /** Existing change requests on the approved direction (edit / change direction). */
  initialChangeRequests?: DecisionChangeRequestRow[];
  changeDirection?: boolean;
}

function mapDecisionStatus(reviewType: FinalDecisionDrawerProps['reviewType']): DecisionStatus {
  return reviewType === 'approve' ? 'approved' : 'changes-needed';
}

function displayVersion(label: string | null | undefined) {
  return label?.replace(/^Iteration\s+(\d+)$/i, 'v$1') ?? label ?? '';
}

export function FinalDecisionDrawer({
  open,
  onClose,
  reviewId,
  reviewType,
  reviewFocus,
  artifacts,
  onDecisionSubmitted,
  currentContributorId,
  initialComments = '',
  initialSelectedIds = [],
  initialChangeRequests = [],
  changeDirection = false,
}: FinalDecisionDrawerProps) {
  const [focusExpanded, setFocusExpanded] = useState(false);
  const [showFocusAccordion, setShowFocusAccordion] = useState(false);
  const focusMeasureRef = useRef<HTMLParagraphElement | null>(null);
  const [comments, setComments] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiOpen, setMultiOpen] = useState(false);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [decisionChangeRequestRows, setDecisionChangeRequestRows] = useState<
    DecisionChangeRequestRow[]
  >([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const approveSelectAnchorRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setFocusExpanded(false);
      setShowFocusAccordion(false);
      setComments('');
      setSelectedIds([]);
      setError(null);
      setMultiOpen(false);
      setShowChangeRequestModal(false);
      setDecisionChangeRequestRows([]);
      setSubmitAttempted(false);
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setComments(initialComments);
      setSelectedIds(initialSelectedIds);
      setDecisionChangeRequestRows(
        initialChangeRequests.map((row) => ({
          artifactIds: [...row.artifactIds],
          changesNeeded: row.changesNeeded,
          isExisting: true,
        })),
      );
    }
  }, [open, initialComments, initialSelectedIds, initialChangeRequests]);

  useEffect(() => {
    function updateFocusOverflow() {
      const node = focusMeasureRef.current;
      if (!node) return;
      setShowFocusAccordion(node.scrollHeight > 80);
    }
    updateFocusOverflow();
    window.addEventListener('resize', updateFocusOverflow);
    return () => window.removeEventListener('resize', updateFocusOverflow);
  }, [reviewFocus, open]);

  const reviewTypeLabel =
    reviewType === 'approve'
      ? 'Approve'
      : reviewType === 'compare'
        ? 'Comparison'
        : 'Align & Critique';

  const canSubmit = useMemo(() => {
    const hasComments = comments.trim().length > 0;
    if (reviewType === 'approve') return selectedIds.length > 0 && hasComments;
    if (reviewType === 'compare') return selectedIds.length > 0 && hasComments;
    return hasComments;
  }, [comments, reviewType, selectedIds]);

  const submitTooltipLabel = useMemo(() => {
    const parts: string[] = [];
    const hasComments = comments.trim().length > 0;
    if (reviewType === 'approve' && selectedIds.length === 0) {
      parts.push('Select at least one artifact');
    }
    if (reviewType === 'compare' && selectedIds.length === 0) {
      parts.push('Select at least one preferred option');
    }
    if (!hasComments) parts.push('Final comments');
    if (parts.length === 0) return 'Complete required fields to proceed';
    return `Complete required fields: ${parts.join(', ')}`;
  }, [comments, reviewType, selectedIds]);

  const selectedArtifactLabel = useMemo(() => {
    const labels = artifacts
      .filter((artifact) => selectedIds.includes(artifact.id))
      .map((artifact) => artifact.title)
      .filter(Boolean);
    return labels.join(', ');
  }, [artifacts, selectedIds]);

  const changeRequestModalArtifacts = useMemo(
    () =>
      artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        label: a.title?.trim() ? a.title : 'Untitled',
        iteration: a.iterationLabel,
      })),
    [artifacts],
  );

  function artifactLabelsForKeys(keys: string[]) {
    return keys.map((key) => {
      const trimmed = key.trim();
      const match = artifacts.find(
        (artifact) =>
          artifact.id === trimmed ||
          (artifact.title?.trim() ?? '') === trimmed ||
          artifact.title === trimmed,
      );
      return match?.title?.trim() || match?.title || trimmed;
    });
  }

  function labelForArtifactIds(ids: string[]) {
    return artifactLabelsForKeys(ids).filter(Boolean).join(', ');
  }

  const isEditMode = changeDirection || initialChangeRequests.length > 0;
  const submitLabel = isEditMode ? 'Resubmit Decision' : 'Submit Decision';

  if (!open) return null;

  return (
    <>
      {/* No full-viewport backdrop — fixed right panel so main content stays scrollable. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Final Decision"
        className="flex h-full flex-col bg-white"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          zIndex: 50,
          boxShadow:
            '-2px 0px 2px rgba(41,33,28,0.08), -8px 0px 12px rgba(41,33,28,0.18)',
        }}
      >
        <div className="flex items-center justify-between border-b border-[#ede8e0] px-6 py-3">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[18px] font-semibold text-[#6b1e2e]">
              {changeDirection ? 'Change Direction' : 'Final Decision'}
            </h2>
            <StatusPill color="mushroom" appearance="filled" label={reviewTypeLabel} size="sm" />
          </div>
          <Button
            label="Close decision drawer"
            aria-label="Close decision drawer"
            variant="secondary"
            size="sm"
            icon="leading"
            iconOnly
            iconName="close"
            onClick={onClose}
            style={{ width: 32, height: 32, padding: 0 }}
          />
        </div>

        <div className="flex flex-col gap-[10px] bg-[#f3efe9] px-6 py-4">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
            Review Focus
          </p>
          {!reviewFocus.trim() ? (
            <p
              className="m-0 text-left text-[13px] leading-snug"
              style={{
                color: 'var(--text/secondary, #6b5e55)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              No review focus provided.
            </p>
          ) : (
            <>
              <p
                ref={focusMeasureRef}
                aria-hidden="true"
                className="m-0"
                style={{
                  position: 'absolute',
                  visibility: 'hidden',
                  pointerEvents: 'none',
                  zIndex: -1,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#6b5e55',
                  lineHeight: 1.5,
                  letterSpacing: '0.26px',
                  width: 'calc(100% - 48px)',
                }}
              >
                {reviewFocus}
              </p>
              <p
                className="m-0"
                style={{
                  margin: 0,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#6b5e55',
                  lineHeight: 1.5,
                  letterSpacing: '0.26px',
                  ...(showFocusAccordion && !focusExpanded
                    ? { maxHeight: 80, overflow: 'hidden' }
                    : {}),
                }}
              >
                {reviewFocus}
              </p>
              {showFocusAccordion ? (
                <div className="flex w-full items-center gap-4 py-1">
                  <span className="h-px min-w-0 flex-1 bg-[#e4ddd3]" aria-hidden="true" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon="leading"
                    iconName={focusExpanded ? 'chevron-up' : 'chevron-down'}
                    label={focusExpanded ? 'Show less' : 'Show more'}
                    onClick={() => setFocusExpanded((prev) => !prev)}
                  />
                  <span className="h-px min-w-0 flex-1 bg-[#e4ddd3]" aria-hidden="true" />
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {(reviewType === 'approve' || reviewType === 'compare') && (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[13px] font-medium text-[#2e1c1c]">
                {reviewType === 'approve'
                  ? 'Select which artifacts are approved*'
                  : 'Select your preferred option*'}
              </p>
              {reviewType === 'approve' ? (
                <div ref={approveSelectAnchorRef} className="relative">
                  <SelectField
                    label=""
                    type="single"
                    size="sm"
                    placeholder="Select an option"
                    selectedLabel={selectedArtifactLabel || undefined}
                    isOpen={multiOpen}
                    onOpen={() => setMultiOpen((prev) => !prev)}
                    aria-controls="approve-artifacts-menu"
                    className="!gap-0 [&>label]:hidden"
                    error={submitAttempted && selectedIds.length === 0}
                    errorMessage="Select at least one artifact"
                  />
                  <Menu
                    id="approve-artifacts-menu"
                    open={multiOpen}
                    onClose={() => setMultiOpen(false)}
                    anchorRef={approveSelectAnchorRef}
                    align="left"
                    type="multi-select"
                  >
                    <li role="none" className="list-none px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          label=""
                          checked={selectedIds.length === artifacts.length && artifacts.length > 0}
                          onChange={(checked) =>
                            setSelectedIds(checked ? artifacts.map((artifact) => artifact.id) : [])
                          }
                        />
                        <span className="text-[13px] text-[#2e1c1c]">All</span>
                      </label>
                    </li>
                    <li role="none" className="list-none px-3 py-1">
                      <Divider className="w-full" />
                    </li>
                    {artifacts.map((artifact) => (
                      <li key={artifact.id} role="none" className="list-none px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            label=""
                            checked={selectedIds.includes(artifact.id)}
                            onChange={(checked) =>
                              setSelectedIds((prev) =>
                                checked
                                  ? [...prev, artifact.id]
                                  : prev.filter((id) => id !== artifact.id),
                              )
                            }
                          />
                          <span className="text-[13px] text-[#2e1c1c]">{artifact.title}</span>
                        </label>
                      </li>
                    ))}
                  </Menu>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {artifacts.map((artifact) => {
                      const isSelected = selectedIds.includes(artifact.id);
                      return (
                        <div
                          key={artifact.id}
                          style={{
                            border: isSelected ? '1px solid #ffe96c' : '1px solid #e4ddd3',
                            background: '#ffffff',
                            borderRadius: 8,
                            minHeight: 52,
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <Checkbox
                            id={`decision-artifact-${artifact.id}`}
                            label=""
                            checked={isSelected}
                            onChange={(checked) =>
                              setSelectedIds((prev) =>
                                checked
                                  ? prev.includes(artifact.id)
                                    ? prev
                                    : [...prev, artifact.id]
                                  : prev.filter((id) => id !== artifact.id),
                              )
                            }
                          />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              color: '#2e1c1c',
                              letterSpacing: '0.26px',
                            }}
                          >
                            {artifact.title}
                          </span>
                          {artifact.iterationLabel ? (
                            <Tag
                              label={displayVersion(artifact.iterationLabel)}
                              variant="default"
                              size="sm"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {submitAttempted && selectedIds.length === 0 ? (
                    <p className="m-0 mt-1 text-[12px] text-[#8b2020]" role="alert">
                      Select at least one preferred option
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] font-medium text-[#2e1c1c]">Final Comments*</p>
            <Textarea
              showLabel={false}
              placeholder={
                reviewType === 'align' || reviewType === 'critique'
                  ? 'Summarise the outcome of this review...'
                  : 'Provide your reasons for selecting this/these option(s)...'
              }
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              variant="form-fixed"
              state={submitAttempted && !comments.trim() ? 'error' : 'default'}
              errorText={
                submitAttempted && !comments.trim() ? 'Final comments is required' : undefined
              }
            />
          </div>

          {reviewType === 'compare' && currentContributorId ? (
            <div className="flex flex-col gap-3">
              {decisionChangeRequestRows.length === 0 ? (
                <Button
                  type="button"
                  label="Request a change"
                  variant="accent"
                  size="md"
                  className="w-full"
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--brand/accent, #ffe96c)',
                    color: 'var(--text/on-accent, #2a221b)',
                    borderColor: 'transparent',
                  }}
                  onClick={() => setShowChangeRequestModal(true)}
                />
              ) : null}
              {decisionChangeRequestRows.length > 0 ? (
                <div className="flex w-full flex-col gap-2">
                  <label className="text-[13px] font-medium text-[#2e1c1c]">Changes</label>
                  <div className="flex w-full flex-col gap-1">
                    {decisionChangeRequestRows.map((row, idx) => {
                      const artifactLabels = artifactLabelsForKeys(row.artifactIds).filter(
                        Boolean,
                      );
                      return (
                        <div
                          key={`${row.artifactIds.join(',')}-${idx}`}
                          className="flex w-full min-h-[40px] items-center gap-2 rounded-[4px] border border-[#e4ddd3] bg-[#f3efe9] px-3 py-2"
                        >
                          <span className="shrink-0 text-[13px] font-medium text-[#6b5e55]">
                            {idx + 1}.
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-medium text-[#2e1c1c]">
                            {row.changesNeeded}
                          </span>
                          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
                            <Tag
                              label={`Change ${idx + 1}`}
                              variant="butter"
                              size="sm"
                            />
                            {artifactLabels.map((label) => (
                              <Tag
                                key={`${idx}-${label}`}
                                label={label}
                                variant="neutral"
                                size="sm"
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            aria-label="Remove change request"
                            className="inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#6b1e2e] cursor-pointer"
                            onClick={() =>
                              setDecisionChangeRequestRows((prev) =>
                                prev.filter((_, rowIndex) => rowIndex !== idx),
                              )
                            }
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    label="Add another change"
                    variant="ghost"
                    size="sm"
                    icon="leading"
                    iconName="plus"
                    className="self-start"
                    onClick={() => setShowChangeRequestModal(true)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="m-0 text-[13px] text-[#8a1f1f]">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-[#ede8e0] px-6 pb-5 pt-4">
          <span className="text-[13px] text-[#6b5e55]">Required*</span>
          <div className="flex items-center gap-2">
            <Button label="Cancel" variant="secondary" size="md" onClick={onClose} />
            <div
              onPointerDownCapture={() => {
                if (!canSubmit || submitting) setSubmitAttempted(true);
              }}
              style={{ display: 'inline-flex' }}
            >
              {canSubmit && !submitting ? (
                <Button
                  label={submitLabel}
                  variant="primary"
                  size="md"
                  onClick={async () => {
                    setSubmitting(true);
                    setError(null);
                    try {
                      const hasCr = decisionChangeRequestRows.length > 0;
                      await submitDecisionAction({
                        reviewId,
                        decisionStatus: mapDecisionStatus(reviewType),
                        decisionComments: comments.trim(),
                        selectedArtifactIds:
                          reviewType === 'approve' || reviewType === 'compare'
                            ? selectedIds
                            : undefined,
                        hasChangeRequests: reviewType === 'compare' ? hasCr : undefined,
                        changeDirection:
                          reviewType === 'compare' ? changeDirection : undefined,
                        decisionChangeRequests:
                          reviewType === 'compare' && hasCr
                            ? decisionChangeRequestRows
                            : undefined,
                      });
                      onDecisionSubmitted();
                      onClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not submit decision');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
              ) : (
                <Tooltip label={submitting ? 'Please wait…' : submitTooltipLabel}>
                  <span className="inline-flex">
                    <Button
                      label={submitting ? 'Submitting...' : submitLabel}
                      variant="primary"
                      size="md"
                      disabled
                      aria-disabled
                    />
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </aside>

      {showChangeRequestModal && currentContributorId ? (
        <ChangeRequestModal
          reviewId={reviewId}
          reviewerContributorId={currentContributorId}
          artifacts={changeRequestModalArtifacts}
          persistToDatabase={false}
          onClose={(saved) => {
            setShowChangeRequestModal(false);
            if (saved?.length) {
              setDecisionChangeRequestRows((prev) => [
                ...prev,
                ...saved.map((s) => ({
                  artifactIds: s.artifactIds,
                  changesNeeded: s.changesNeeded,
                  isExisting: false,
                })),
              ]);
            }
          }}
        />
      ) : null}
    </>
  );
}
