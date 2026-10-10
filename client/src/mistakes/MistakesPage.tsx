import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Category, CategoryCount, CategoryMistake } from '../api.js';
import { ApiError, fetchCategorizationMistakes, fetchCategorizationSummary, logout } from '../api.js';
import { CATEGORY_INFO } from './categoryInfo.js';
import { MistakesTable } from './MistakesTable.js';
import { HeaderMenu } from '../nav/HeaderMenu.js';
import {
  AccountLink,
  BackLink,
  HeaderSeparator,
  LearnLink,
  LogoutButton,
  ProgressLink,
  TrainLink,
} from '../nav/HeaderItems.js';

type LoadState = 'loading' | 'ready' | 'error';

interface CategoryState {
  items: CategoryMistake[];
  nextCursor: string | null;
  loadState: LoadState;
}

function isCategory(value: string | undefined): value is Category {
  return CATEGORY_INFO.some((info) => info.category === value);
}

export function MistakesPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { category: categoryParam } = useParams<{ category?: string }>();
  const navigate = useNavigate();
  const openCategory: Category | null = isCategory(categoryParam) ? categoryParam : null;
  const openInfo = CATEGORY_INFO.find((info) => info.category === openCategory);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [counts, setCounts] = useState<Map<Category, number>>(new Map());
  const [categoryStates, setCategoryStates] = useState<Map<Category, CategoryState>>(new Map());

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

  useEffect(() => {
    if (openCategory && !categoryStates.has(openCategory)) {
      loadCategoryPage(openCategory, null);
    }
  }, [openCategory, categoryStates, loadCategoryPage]);

  // On phones the grid is hidden while a category is open (see styles.css), so the
  // panel can jump above the viewport if the user tapped a card far down the list.
  // On desktop the grid stays above the panel, so its top is never negative.
  const accordionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const top = accordionRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) {
      window.scrollTo(0, 0);
    }
  }, [openCategory]);

  function handleCardClick(category: Category) {
    const count = counts.get(category) ?? 0;
    if (count === 0) return;
    navigate(openCategory === category ? '/mistakes' : `/mistakes/${category}`);
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  if (categoryParam !== undefined && !isCategory(categoryParam)) {
    return <Navigate to="/mistakes" replace />;
  }

  return (
    <div className={openCategory ? 'app-shell mistakes-page category-open' : 'app-shell mistakes-page'}>
      <header className="app-header">
        <h1>Mistakes</h1>
        <HeaderMenu>
          <BackLink to="/" destination="cards" />
          <HeaderSeparator />
          <LearnLink />
          <TrainLink />
          <ProgressLink />
          <HeaderSeparator />
          <AccountLink />
          <LogoutButton onClick={handleLogout} />
        </HeaderMenu>
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
                label={openInfo?.label ?? openCategory}
                description={openInfo?.description ?? ''}
                sectionRef={accordionRef}
                state={categoryStates.get(openCategory) ?? { items: [], nextCursor: null, loadState: 'loading' }}
                onRetry={() => loadCategoryPage(openCategory, null)}
                onLoadMore={(cursor) => loadCategoryPage(openCategory, cursor)}
              />
            )}
          </>
        )}
      </main>
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
  description,
  sectionRef,
  state,
  onRetry,
  onLoadMore,
}: {
  label: string;
  description: string;
  sectionRef: Ref<HTMLElement>;
  state: CategoryState;
  onRetry: () => void;
  onLoadMore: (cursor: string) => void;
}) {
  return (
    <section ref={sectionRef} className="mistakes-accordion" aria-label={`${label} mistakes`}>
      <Link to="/mistakes" className="mistakes-back-link">
        &larr; All categories
      </Link>
      <h2>{label}</h2>
      <p className="hint mistakes-accordion-description">{description}</p>
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
      {state.loadState === 'ready' && state.items.length === 0 && (
        <p className="hint">No mistakes in this category yet.</p>
      )}
      {state.items.length > 0 && (
        <>
          <MistakesTable items={state.items} />
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
