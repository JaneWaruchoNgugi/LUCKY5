import './style.css';
import { byId, one } from './dom';
import { Game } from './game';
import { Sound } from './sound';
import { mountSoundSettings } from './sound-settings';
import { Tour, type TourStep } from './tour';

const sound = new Sound();
const game = new Game(sound);
const closeSoundSettings = mountSoundSettings(sound);

const railBand = () => game.rail.geo().hist;
const steps: TourStep[] = [
  {
    target: () => byId('rail'),
    area: (r) => ({ ...r, top: r.top + railBand(), height: r.height - railBand() }),
    title: 'Balls roll on their own',
    text: 'Every few seconds a numbered ball slides in and stops under the yellow marker. Each ball carries a multiplier, shown under it.',
  },
  {
    target: () => byId('rail'),
    area: (r) => ({ ...r, height: railBand() }),
    title: 'Previous balls',
    text: 'The last results sit along the top, in their group colour. Balls you bet on get a green outline for a win and red for a loss.',
  },
  {
    target: () => one('.f-bet'),
    title: 'Set your bet',
    text: 'Type an amount in KES, use − and + to adjust it, or tap a quick amount.',
  },
  {
    target: () => one('.picks'),
    title: 'Pick a colour group',
    text: 'B is blue (1–15), I red (16–30), N grey (31–45), G green (46–60) and O orange (61–75). Each has a 1 in 5 chance.',
  },
  {
    target: () => byId('play'),
    title: 'Place your bet',
    text: 'Your bet joins the next ball. If that ball is your colour, you win your bet × its multiplier. You can cancel until the ball starts rolling.',
  },
  {
    target: () => one('.tabs'),
    title: 'Manual or Auto',
    text: 'Auto places the same bet for 10, 25, 50 or 100 rounds in a row. Press Stop auto at any time.',
  },
  {
    target: () => byId('soundBtn'),
    title: 'Sound settings',
    text: 'Turn sound on or off, set the volume, and choose which sounds you hear. You can replay this tour from the ? button.',
  },
];

const tour = new Tour(steps, () => sound.play('click'));
game.shortcutsBlocked = () => tour.isOpen;
byId('helpBtn').addEventListener('click', () => {
  closeSoundSettings();
  tour.start();
});

game.start();
if (!Tour.seen()) setTimeout(() => tour.start(), 700);
