import { useEffect } from 'react';
import type { ReviewRating } from '../api.js';

interface RatingOption {
  rating: ReviewRating;
  label: string;
  shortcut: string;
}

const RATING_OPTIONS: RatingOption[] = [
  { rating: 'again', label: "Don't remember", shortcut: '0' },
  { rating: 'hard', label: 'Hard', shortcut: '1' },
  { rating: 'good', label: 'Good', shortcut: '2' },
  { rating: 'easy', label: 'Easy', shortcut: '3' },
];

interface RatingBarProps {
  // 'again' is only offered for incorrect/empty answers; a detected-correct
  // answer can only be rated hard/good/easy.
  allowAgain: boolean;
  emphasized: ReviewRating;
  disabled: boolean;
  onRate: (rating: ReviewRating) => void;
}

export function RatingBar({ allowAgain, emphasized, disabled, onRate }: RatingBarProps) {
  const options = RATING_OPTIONS.filter((option) => allowAgain || option.rating !== 'again');

  // Number-key shortcuts (0–3), active only while the rating bar is shown and
  // ignored when the user is typing in some other control.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const option = options.find((o) => o.shortcut === event.key);
      if (!option) return;
      event.preventDefault();
      onRate(option.rating);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, disabled, onRate]);

  return (
    <div className="rating-bar">
      {options.map((option) => (
        <button
          key={option.rating}
          type="button"
          className={option.rating === emphasized ? 'rating emphasized' : 'rating secondary'}
          disabled={disabled}
          autoFocus={option.rating === emphasized}
          onClick={() => onRate(option.rating)}
        >
          {option.label} <span className="shortcut-hint">({option.shortcut})</span>
        </button>
      ))}
    </div>
  );
}
