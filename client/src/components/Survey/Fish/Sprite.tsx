import { FISH_FRAMES, FRAME_CELL, FRAME_WIDTH, fishSheetUrl } from './pixels';
import { FISH_HEIGHT, FISH_WIDTH } from './swim';

const SHEET = `url("${fishSheetUrl()}")`;
const SHEET_WIDTH = (FISH_WIDTH / FRAME_WIDTH) * FRAME_CELL * FISH_FRAMES.length;

/** A window onto the frame strip. CSS slides the strip one whole frame at a time. */
export default function Sprite() {
  return (
    <span aria-hidden="true" className="survey-fish-shadow block">
      <span className="block overflow-hidden" style={{ width: FISH_WIDTH, height: FISH_HEIGHT }}>
        <span
          className="survey-fish-strip block bg-no-repeat"
          style={{
            width: SHEET_WIDTH,
            height: FISH_HEIGHT,
            backgroundImage: SHEET,
            backgroundSize: `${SHEET_WIDTH}px ${FISH_HEIGHT}px`,
          }}
        />
      </span>
    </span>
  );
}
