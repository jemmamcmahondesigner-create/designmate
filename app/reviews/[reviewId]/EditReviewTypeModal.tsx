'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon } from '@/components/ui/ds';
import { updateReviewTypeAction } from './actions';

export type EditReviewTypeModalProps = {
  reviewId: string;
  currentType: string;
  onClose: () => void;
  /** Invoked after a successful update so the host can show a toast and refresh. */
  onUpdated?: () => void;
};

type ReviewTypeKey = 'compare' | 'align' | 'critique' | 'approve';

function normalizeType(t: string): ReviewTypeKey {
  const x = String(t ?? '')
    .trim()
    .toLowerCase();
  if (x === 'comparison') return 'compare';
  if (x === 'alignment') return 'align';
  if (x === 'approval') return 'approve';
  if (x === 'compare' || x === 'align' || x === 'critique' || x === 'approve') return x;
  return 'align';
}

const TYPE_CARDS: Array<{
  key: ReviewTypeKey;
  label: string;
  labelColor: string;
  defaultOuterBg: string;
  defaultOuterBorder: string;
  hoverOuterBg: string;
  hoverOuterBorder: string;
  activeOuterBg: string;
  activeOuterBorder: string;
  defaultIconBg: string;
  defaultIconBorder: string;
  activeIconBg: string;
  activeIconBorder: string;
  description: string;
}> = [
  {
    key: 'align',
    label: 'ALIGNMENT',
    labelColor: '#1a527a',
    defaultOuterBg: '#ffffff',
    defaultOuterBorder: '#ede8e0',
    hoverOuterBg: '#ffffff',
    hoverOuterBorder: '#c9c0b4',
    activeOuterBg: '#e5f3f9',
    activeOuterBorder: '#6baed4',
    defaultIconBg: '#e5f3f9',
    defaultIconBorder: '#6baed4',
    activeIconBg: '#ffffff',
    activeIconBorder: '#6baed4',
    description:
      'Does the proposed direction align with the project goals and brand guidelines?',
  },
  {
    key: 'compare',
    label: 'COMPARE',
    labelColor: '#7a5500',
    defaultOuterBg: '#ffffff',
    defaultOuterBorder: '#ede8e0',
    hoverOuterBg: '#ffffff',
    hoverOuterBorder: '#c9c0b4',
    activeOuterBg: '#fff6d7',
    activeOuterBorder: '#e5c820',
    defaultIconBg: '#ffecac',
    defaultIconBorder: '#e5c820',
    activeIconBg: '#ffffff',
    activeIconBorder: '#e5c820',
    description:
      'When you are seeking design direction by comparing options against each other. Reviewers will select a preferred option. A decision will be recorded when feedback is complete.',
  },
  {
    key: 'critique',
    label: 'CRITIQUE',
    labelColor: '#5c524a',
    defaultOuterBg: '#ffffff',
    defaultOuterBorder: '#ede8e0',
    hoverOuterBg: '#ffffff',
    hoverOuterBorder: '#c9c0b4',
    activeOuterBg: '#f3efe9',
    activeOuterBorder: '#c9c0b4',
    defaultIconBg: '#f3efe9',
    defaultIconBorder: '#c9c0b4',
    activeIconBg: '#ffffff',
    activeIconBorder: '#c9c0b4',
    description:
      'When requesting a thorough review of your work, you are inviting stakeholders to examine the artefacts within file and leaving feedback.',
  },
  {
    key: 'approve',
    label: 'APPROVAL',
    labelColor: '#256b38',
    defaultOuterBg: '#ffffff',
    defaultOuterBorder: '#ede8e0',
    hoverOuterBg: '#ffffff',
    hoverOuterBorder: '#c9c0b4',
    activeOuterBg: '#ebf6ee',
    activeOuterBorder: '#7dc98f',
    defaultIconBg: '#ebf6ee',
    defaultIconBorder: '#7dc98f',
    activeIconBg: '#ffffff',
    activeIconBorder: '#7dc98f',
    description:
      'This review type is for obtaining sign-off on design work. Reviewers can approve or request changes on individual artifacts. A decision will be recorded when all feedback is complete.',
  },
];

export function EditReviewTypeModal({
  reviewId,
  currentType,
  onClose,
  onUpdated,
}: EditReviewTypeModalProps) {
  const router = useRouter();
  const normalizedCurrent = useMemo(() => normalizeType(currentType), [currentType]);
  const [selectedType, setSelectedType] = useState<ReviewTypeKey>(normalizedCurrent);
  const [hoveredType, setHoveredType] = useState<ReviewTypeKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDisabled = submitting || selectedType === normalizedCurrent;

  const handleUpdate = async () => {
    if (selectedType === normalizedCurrent) return;
    setSubmitting(true);
    setError(null);
    const result = await updateReviewTypeAction({
      reviewId,
      reviewType: selectedType,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? 'Could not update review type.');
      return;
    }
    onUpdated?.();
    router.refresh();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[90vh] flex-col overflow-hidden bg-white"
        style={{
          width: 560,
          maxWidth: '100%',
          borderRadius: 16,
          boxShadow:
            '0px 4px 4px rgba(41,33,28,0.08), 0px 16px 16px rgba(41,33,28,0.2)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-review-type-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid #ede8e0' }}
        >
          <h2
            id="edit-review-type-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#6b1e2e',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Edit Review Type
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              border: 'none',
              background: 'transparent',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#2e1c1c',
              lineHeight: 1.5,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            The following review options require different stakeholder feedback. Select an
            option based on what type your project requires.
          </p>

          {error ? (
            <p style={{ margin: 0, fontSize: 13, color: '#b42318' }}>{error}</p>
          ) : null}

          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {TYPE_CARDS.map((card) => {
              const isSelected = selectedType === card.key;
              const isHovered = hoveredType === card.key && !isSelected;
              const outerBg = isSelected
                ? card.activeOuterBg
                : isHovered
                  ? card.hoverOuterBg
                  : card.defaultOuterBg;
              const outerBorder = isSelected
                ? card.activeOuterBorder
                : isHovered
                  ? card.hoverOuterBorder
                  : 'transparent';
              const cardShadow = isHovered
                ? '0px 2px 2px rgba(0,0,0,0.1)'
                : isSelected
                  ? 'none'
                  : 'inset 0 0 0 1px #ede8e0';
              const iconBg = isSelected ? card.activeIconBg : card.defaultIconBg;
              const iconBorder = isSelected ? card.activeIconBorder : card.defaultIconBorder;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setSelectedType(card.key)}
                  onMouseEnter={() => setHoveredType(card.key)}
                  onMouseLeave={() => setHoveredType((prev) => (prev === card.key ? null : prev))}
                  className="text-left"
                  style={{
                    backgroundColor: outerBg,
                    border: `2px solid ${outerBorder}`,
                    borderRadius: 6,
                    padding: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxSizing: 'border-box',
                    boxShadow: cardShadow,
                    transition: 'background-color 150ms ease, border-color 150ms ease',
                  }}
                >
                  <div
                    style={{
                      height: 62,
                      borderRadius: 4,
                      backgroundColor: iconBg,
                      border: `1px solid ${iconBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 150ms ease, border-color 150ms ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        flex: 1,
                      }}
                    >
                      <Icon name="nav-reviews" size={24} />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: card.labelColor,
                        }}
                      >
                        {card.label}
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: isSelected ? '#2e1c1c' : '#6b5e55',
                      lineHeight: 1.45,
                    }}
                  >
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <footer
          className="flex shrink-0 justify-end gap-2 px-6 pb-5 pt-4"
          style={{ borderTop: '1px solid #ede8e0' }}
        >
          <Button variant="secondary" size="sm" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            size="sm"
            label="Update Review Type"
            disabled={updateDisabled}
            onClick={() => {
              void handleUpdate();
            }}
          />
        </footer>
      </div>
    </div>
  );
}
