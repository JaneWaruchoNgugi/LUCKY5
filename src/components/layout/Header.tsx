import { SettingsMenu } from './SettingsMenu';
import { Wallet } from './Wallet';

export function Header() {
  return (
    <header>
      <div className="logo" aria-label="Lucky Five">
        <em className="lw">LUCKY</em>
        <span className="lb" />
        <span className="li" />
        <span className="ln" />
        <span className="lg" />
        <span className="lo" />
        <em>FIVE</em>
      </div>
      <div className="hdr-right">
        <Wallet />
        <SettingsMenu />
      </div>
    </header>
  );
}
