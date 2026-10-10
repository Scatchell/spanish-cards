export function Stat({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string | number;
  emphasized?: boolean;
}) {
  return (
    <div className={emphasized ? 'stat-tile emphasized' : 'stat-tile'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
