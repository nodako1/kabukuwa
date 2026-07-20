interface BottomNavProps {
  onMap: () => void;
  onBook: () => void;
  onPeople: () => void;
  onRest: () => void;
  disabled: boolean;
}

export const BottomNav = ({ onMap, onBook, onPeople, onRest, disabled }: BottomNavProps) => (
  <nav className="bottom-nav" aria-label="ゲームメニュー">
    <button onClick={onMap} disabled={disabled}>
      <i className="nav-symbol map-symbol" aria-hidden="true" />
      <span>地図</span>
    </button>
    <button onClick={onBook}>
      <i className="nav-symbol book-symbol" aria-hidden="true" />
      <span>虫図鑑</span>
    </button>
    <button onClick={onPeople}>
      <i className="nav-symbol people-symbol" aria-hidden="true" />
      <span>ひとびと</span>
    </button>
    <button onClick={onRest} disabled={disabled}>
      <i className="nav-symbol rest-symbol" aria-hidden="true" />
      <span>ひと休み</span>
    </button>
  </nav>
);
