'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
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
}

function mapDecisionStatus(reviewType: FinalDecisionDrawerProps['reviewType']): DecisionStatus {
  return reviewType === 'approve' ? 'approved' : 'changes-needed';
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
}: FinalDecisionDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [focusOverflows, setFocusOverflows] = useState(false);
  const focusRef = useRef<HTMLParagraphElement | null>(null);
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

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setFocusOverflows(false);
      setComments('');
      setSelectedIds([]);
      setError(null);
      setMultiOpen(false);
      setShowChangeRequestModal(false);
      setDecisionChangeRequestRows([]);
      setSubmitAttempted(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !reviewFocus.trim()) {
      setFocusOverflows(false);
      return;
    }
    const el = focusRef.current;
    if (!el) {
      setFocusOverflows(false);
      return;
    }
    if (expanded) {
      setFocusOverflows(false);
      return;
    }
    setFocusOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [open, reviewFocus, expanded]);

  const reviewTypeLabel =
    reviewType === 'approve'
      ? 'Approve'
      : reviewType === 'compare'
        ? 'Comparison'
        : 'Align & Critique';

  const canSubmit = useMemo(() => {
    const hasComments = comments.trim().length > 0;
    if (reviewType === 'approve') return selectedIds.length > 0 && hasComments;
    if (reviewType === 'compare') return selectedIds.length === 1 && hasComments;
    return hasComments;
  }, [comments, reviewType, selectedIds]);

  const submitTooltipLabel = useMemo(() => {
    const parts: string[] = [];
    const hasComments = comments.trim().length > 0;
    if (reviewType === 'approve' && selectedIds.length === 0) {
      parts.push('Select at least one artifact');
    }
    if (reviewType === 'compare' && selectedIds.length !== 1) {
      parts.push('Select exactly one preferred option');
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

  function labelForArtifactIds(ids: string[]) {
    return ids
      .map((id) => artifacts.find((a) => a.id === id)?.title ?? id)
      .filter(Boolean)
      .join(', ');
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/15" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 flex h-full w-[480px] flex-col bg-white"
        style={{
          boxShadow:
            '-2px 0px 2px rgba(41,33,28,0.08), -8px 0px 12px rgba(41,33,28,0.18)',
        }}
      >
        <div className="flex items-center justify-between border-b border-[#ede8e0] px-6 py-3">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[18px] font-semibold text-[#6b1e2e]">Final Decision</h2>
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
            <div
              className="flex items-center justify-center"
              style={{
                minHeight: 60,
                borderRadius: 'var(--radius/sm, 6px)',
                backgroundColor: 'var(--surface/card/recessed, #f3efe9)',
                border: '1px solid var(--border/subtle, #ede8e0)',
              }}
            >
              <p
                className="m-0 text-center text-[13px] leading-snug"
                style={{
                  color: 'var(--text/secondary, #6b5e55)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                No details have been provided for this review.
              </p>
            </div>
          ) : (
            <>
              <p
                ref={focusRef}
                className="m-0 text-[13px] text-[#6b5e55]"
                style={
                  expanded
                    ? undefined
                    : {
                        maxHeight: 102,
                        overflow: 'hidden',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }
                }
              >
                {reviewFocus}
              </p>
              {focusOverflows ? (
                <button
                  type="button"
                  className="inline-flex w-fit items-center gap-1 border-none bg-transparent p-0 text-[13px] text-[#6b5e55]"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </>
          )}
          {/* TODO: wire feedback summary content (Fix 5 stub) */}
          <button
            type="button"
            className="mt-1 inline-flex w-fit items-center gap-1 border-none bg-transparent p-0 text-[13px] font-medium text-[#6b1e2e]"
            onClick={() => {
              /* TODO: expand to show feedback summary */
            }}
            aria-expanded={false}
          >
            <Icon name="chevron-down" size={14} />
            Show feedback summary
          </button>
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
                  <div
                    className="flex flex-col gap-1"
                    style={
                      submitAttempted && selectedIds.length !== 1
                        ? {
                            borderRadius: 8,
                            padding: 8,
                            outline: '1px solid #e07070',
                            outlineOffset: 0,
                            background: '#fceaea',
                          }
                        : undefined
                    }
                  >
                    {artifacts.map((artifact) => {
                      const checked = selectedIds.includes(artifact.id);
                      return (
                        <label
                          key={artifact.id}
                          className="flex h-[52px] cursor-pointer items-center gap-4 rounded-[8px] border px-4"
                          style={{
                            borderColor: checked
                              ? 'var(--brand/primary, #6b1e2e)'
                              : 'var(--border/default, #e4ddd3)',
                            backgroundColor: checked
                              ? 'var(--brand/accent/subtle, #fff6d7)'
                              : 'transparent',
                          }}
                        >
                          <Checkbox
                            label=""
                            checked={checked}
                            onChange={() => setSelectedIds([artifact.id])}
                          />
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="truncate text-[13px] font-medium"
                              style={{
                                color: checked
                                  ? 'var(--brand/primary, #6b1e2e)'
                                  : 'var(--text/primary, #2e1c1c)',
                              }}
                            >
                              {artifact.title}
                            </span>
                            {artifact.iterationLabel ? (
                              <Tag
                                label={artifact.iterationLabel}
                                variant={checked ? 'brand' : 'neutral'}
                                size="sm"
                              />
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {submitAttempted && selectedIds.length !== 1 ? (
                    <p className="m-0 mt-1 text-[12px] text-[#8b2020]" role="alert">
                      Preferred option is required
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
              {decisionChangeRequestRows.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {decisionChangeRequestRows.map((row, idx) => (
                    <li
                      key={`${row.artifactIds.join(',')}-${idx}`}
                      className="rounded-[6px] border border-[#e4ddd3] bg-white px-3 py-2 text-[13px] text-[#2e1c1c]"
                    >
                      <span className="font-medium text-[#6b1e2e]">
                        {labelForArtifactIds(row.artifactIds)}
                      </span>
                      {row.changesNeeded ? (
                        <p className="m-0 mt-1 text-[12px] leading-snug text-[#6b5e55]">
                          {row.changesNeeded}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {decisionChangeRequestRows.length > 0 ? (
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
                  label="Submit Decision"
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
                      label={submitting ? 'Submitting...' : 'Submit Decision'}
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
          onClose={(saved) => {
            setShowChangeRequestModal(false);
            if (saved?.length) {
              setDecisionChangeRequestRows((prev) => [
                ...prev,
                ...saved.map((s) => ({
                  artifactIds: s.artifactIds,
                  changesNeeded: s.changesNeeded,
                })),
              ]);
            }
          }}
        />
      ) : null}
    </div>
  );
}
