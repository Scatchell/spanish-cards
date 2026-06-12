interface Props {
  onClick: () => void;
  concealed?: boolean;
}

export function ExplainButton({ onClick, concealed = false }: Props) {
  return (
    <button
      type="button"
      className={concealed ? 'explain-button concealed' : 'explain-button'}
      aria-label="Explain"
      title="Explain"
      onClick={onClick}
    >
      Explain <span className="shortcut-hint">(E)</span>
    </button>
  );
}
