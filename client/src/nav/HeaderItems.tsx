import {
  ArrowLeft,
  BookOpen,
  ChartNoAxesColumn,
  CircleX,
  Layers,
  LogOut,
  Target,
  UserRound,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Tone = 'primary' | 'study' | 'review' | 'quiet' | 'danger';

type Icon = ComponentType<{ size?: number }>;

const ICON_SIZE = 18;

function Content({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <>
      <Icon size={ICON_SIZE} />
      <span>{children}</span>
    </>
  );
}

function HeaderLink({
  to,
  icon,
  tone,
  label,
  children,
}: {
  to: string;
  icon: Icon;
  tone: Tone;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`header-item tone-${tone}`} aria-label={label}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}

export function HeaderSeparator() {
  return <span className="header-separator" aria-hidden="true" />;
}

export function BackLink({ to, destination }: { to: string; destination: string }) {
  return (
    <HeaderLink to={to} icon={ArrowLeft} tone="quiet" label={`Back to ${destination}`}>
      Back
    </HeaderLink>
  );
}

export function CardsLink() {
  return (
    <HeaderLink to="/" icon={Layers} tone="quiet">
      Cards
    </HeaderLink>
  );
}

export function LearnLink() {
  return (
    <HeaderLink to="/learn" icon={BookOpen} tone="study">
      Learn
    </HeaderLink>
  );
}

export function TrainLink() {
  return (
    <HeaderLink to="/train" icon={Target} tone="primary">
      Train
    </HeaderLink>
  );
}

export function ProgressLink() {
  return (
    <HeaderLink to="/progress" icon={ChartNoAxesColumn} tone="review">
      Progress
    </HeaderLink>
  );
}

export function MistakesLink() {
  return (
    <HeaderLink to="/mistakes" icon={CircleX} tone="review">
      Mistakes
    </HeaderLink>
  );
}

export function AccountLink() {
  return (
    <HeaderLink to="/account" icon={UserRound} tone="quiet">
      Account
    </HeaderLink>
  );
}

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="header-item tone-danger" onClick={onClick}>
      <Content icon={LogOut}>Log out</Content>
    </button>
  );
}
