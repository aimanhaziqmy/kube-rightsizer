import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriftBadge } from './DriftBadge';
import { DiffChanges } from '../utils/scanDiff';

describe('DriftBadge', () => {
  it('renders nothing when there are no changes', () => {
    const { container } = render(
      <DriftBadge changes={{ recommendation: false, current: false, current_toward_recommended: false, severity: false }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('labels a recommendation change', () => {
    render(<DriftBadge changes={{ recommendation: true, current: false, current_toward_recommended: false, severity: false }} />);
    expect(screen.getByText('Rec changed')).toBeInTheDocument();
  });

  it('labels current allocations that moved toward the recommendation', () => {
    render(<DriftBadge changes={{ recommendation: false, current: true, current_toward_recommended: true, severity: false }} />);
    expect(screen.getByText('Moved toward rec')).toBeInTheDocument();
  });

  it('labels current allocations that moved away from the recommendation', () => {
    render(<DriftBadge changes={{ recommendation: false, current: true, current_toward_recommended: false, severity: false }} />);
    expect(screen.getByText('Moved away')).toBeInTheDocument();
  });

  it('labels a severity change alongside other changes', () => {
    render(<DriftBadge changes={{ recommendation: true, current: false, current_toward_recommended: false, severity: true }} />);
    expect(screen.getByText('Rec changed')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
  });
});

// Keep the type import honest
export type _Changes = DiffChanges;
