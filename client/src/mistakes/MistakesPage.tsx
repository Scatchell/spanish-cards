import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, CategoryCount, CategoryMistake } from '../api.js';
import { ApiError, fetchCategorizationMistakes, fetchCategorizationSummary, logout } from '../api.js';
import { CATEGORY_INFO } from './categoryInfo.js';
import { PracticeModal } from './PracticeModal.js';

type LoadState = 'loading' | 'ready' | 'error';

interface CategoryState {
  items: CategoryMistake[];
  nextCursor: string | null;
  loadState: LoadState;
}

export function MistakesPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [counts, setCounts] = useState<Map<Category, number>>(new Map());
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [categoryStates, setCategoryStates] = useState<Map<Category, CategoryState>>(new Map());
  const [practiceMistake, setPracticeMistake] = useState<CategoryMistake | null>(null);

  const handleUnauthenticated = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return true;
      }
      return false;
    },
    [onLoggedOut],
  );

  const load = useCallback(() => {
    setLoadState('loading');
    fetchCategorizationSummary()
      .then((data) => {
        setCounts(new Map(data.categories.map((c: CategoryCount) => [c.category, c.count])));
        setLoadState('ready');
      })
      .catch((err) => {
        if (!handleUnauthenticated(err)) {
          setLoadState('error');
        }
      });
  }, [handleUnauthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCategoryPage = useCallback(
    (category: Category, cursor: string | null) => {
      setCategoryStates((existing) => {
        const next = new Map(existing);
        const current = next.get(category) ?? { items: [], nextCursor: null, loadState: 'loading' as LoadState };
        next.set(category, { ...current, loadState: 'loading' });
        return next;
      });
      fetchCategorizationMistakes(category, cursor)
        .then((page) => {
          setCategoryStates((existing) => {
            const next = new Map(existing);
            const current = next.get(category);
            const items = cursor && current ? [...current.items, ...page.items] : page.items;
            next.set(category, { items, nextCursor: page.nextCursor, loadState: 'ready' });
            return next;
          });
        })
        .catch((err) => {
          if (handleUnauthenticated(err)) return;
          setCategoryStates((existing) => {
            const next = new Map(existing);
            const current = next.get(category) ?? { items: [], nextCursor: null, loadState: 'loading' as LoadState };
            next.set(category, { ...current, loadState: 'error' });
            return next;
          });
        });
    },
    [handleUnauthenticated],
  );

  function handleCardClick(category: Category) {
    const count = counts.get(category) ?? 0;
    if (count === 0) return;
    if (openCategory === category) {
      setOpenCategory(null);
      return;
    }
    setOpenCategory(category);
    if (!categoryStates.has(category)) {
      loadCategoryPage(category, null);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Mistakes</h1>
        <div className="header-actions">
          <Link to="/" className="back-link">
            Back to cards
          </Link>
          <Link to="/learn" className="learn-link">
            Learn
          </Link>
          <Link to="/train" className="train-link">
            Train
          </Link>
          <Link to="/progress" className="progress-link">
            Progress
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        {loadState === 'loading' && <p className="hint">Loading mistakes…</p>}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong.{' '}
            <button type="button" className="secondary" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {loadState === 'ready' && (
          <>
            <ul className="category-grid">
              {CATEGORY_INFO.map((info) => (
                <CategoryCard
                  key={info.category}
                  info={info}
                  count={counts.get(info.category) ?? 0}
                  open={openCategory === info.category}
                  onClick={() => handleCardClick(info.category)}
                />
              ))}
            </ul>
            {openCategory && (
              <CategoryAccordion
                label={CATEGORY_INFO.find((c) => c.category === openCategory)?.label ?? openCategory}
                state={categoryStates.get(openCategory) ?? { items: [], nextCursor: null, loadState: 'loading' }}
                onRetry={() => loadCategoryPage(openCategory, null)}
                onLoadMore={(cursor) => loadCategoryPage(openCategory, cursor)}
                onPractice={setPracticeMistake}
              />
            )}
          </>
        )}
      </main>
      {practiceMistake && (
        <PracticeModal mistake={practiceMistake} onClose={() => setPracticeMistake(null)} />
      )}
    </div>
  );
}

function CategoryCard({
  info,
  count,
  open,
  onClick,
}: {
  info: (typeof CATEGORY_INFO)[number];
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  const Icon = info.icon;
  const disabled = count === 0;
  return (
    <li className={disabled ? 'category-card muted' : open ? 'category-card open' : 'category-card'}>
      <button
        type="button"
        className="category-card-button"
        onClick={onClick}
        disabled={disabled}
        aria-label={info.label}
      >
        <Icon size={36} />
        <span className="category-card-label">{info.label}</span>
        <span className="category-card-description hint">{info.description}</span>
        <span className="category-card-count">{count} mistake{count === 1 ? '' : 's'}</span>
      </button>
    </li>
  );
}

function CategoryAccordion({
  label,
  state,
  onRetry,
  onLoadMore,
  onPractice,
}: {
  label: string;
  state: CategoryState;
  onRetry: () => void;
  onLoadMore: (cursor: string) => void;
  onPractice: (mistake: CategoryMistake) => void;
}) {
  return (
    <section className="mistakes-accordion" aria-label={`${label} mistakes`}>
      <h2>{label}</h2>
      {state.loadState === 'loading' && state.items.length === 0 && (
        <p className="hint">Loading mistakes…</p>
      )}
      {state.loadState === 'error' && (
        <p className="form-error" role="alert">
          Something went wrong.{' '}
          <button type="button" className="secondary" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {state.items.length > 0 && (
        <>
          <table className="mistakes-table">
            <thead>
              <tr>
                <th>Correct</th>
                <th>Submitted</th>
                <th>Rationale</th>
                <th>Practice targets</th>
                <th>Practice</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.correctText}</td>
                  <td>{item.submittedText}</td>
                  <td>{item.rationale}</td>
                  <td>
                    {item.practiceTargets.map((target, i) => (
                      <span key={i} className="practice-target-pill">
                        {target.submitted ?? '(nothing entered)'} &rarr; {target.expected}
                      </span>
                    ))}
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => onPractice(item)}>
                      Practice this mistake
                    </button>
                  </td>
                  <td>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.nextCursor && (
            <button
              type="button"
              className="secondary"
              onClick={() => onLoadMore(state.nextCursor as string)}
              disabled={state.loadState === 'loading'}
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
