'use client';
import { Group, LargeButton, Col, SmallButton } from './parts';
import { alertBox, openDialog, S, setState, useStore } from '../../state/store';
import { setDocSettings } from '../../state/sections';
import { readAloud, stopReading, isReading } from '../../state/speech';
import { Ruler, Grid3x3, PanelLeft, Moon, Pen, Highlighter, Eraser } from 'lucide-react';
import {
  AcceptIcon,
  CommentIcon,
  CompareIcon,
  DraftIcon,
  FocusIcon,
  HelpIcon,
  MultiPageIcon,
  NewWindowIcon,
  OnePageIcon,
  OutlineIcon,
  PageWidthIcon,
  PrintLayoutIcon,
  ProtectIcon,
  ReadAloudIcon,
  ReadModeIcon,
  RejectIcon,
  SpellingIcon,
  ThesaurusIcon,
  TrackChangesIcon,
  WebLayoutIcon,
  WordCountIcon,
  ZoomIcon,
  Zoom100Icon,
} from '../icons';
import { getLayout } from '../../state/editor';

const notYet = (what: string) => () => alertBox(`${what} isn't available in MyWord yet.`, 'info');

export function ReviewTab() {
  const track = useStore((s) => s.trackChanges);
  const mode = useStore((s) => s.editingMode);
  useStore((s) => s.rev);
  return (
    <>
      <Group label="Proofing">
        <LargeButton icon={<SpellingIcon />} label={'Editor'} title="Spelling & Grammar (F7)" onClick={() => import('../../state/spell').then((m) => m.openEditorPane())} />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><ThesaurusIcon /></span>} label="Thesaurus" onClick={notYet('Thesaurus')} />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><WordCountIcon /></span>} label="Word Count" onClick={() => openDialog('wordCount')} testId="word-count" />
        </Col>
      </Group>
      <Group label="Speech">
        <LargeButton icon={<ReadAloudIcon />} label={'Read\nAloud'} checked={isReading()} onClick={() => (isReading() ? stopReading() : readAloud())} />
      </Group>
      <Group label="Accessibility">
        <LargeButton icon={<span className="text-[20px]">♿</span>} label={'Check\nAccessibility'} onClick={() => import('../../state/accessibility').then((m) => m.checkAccessibility())} />
      </Group>
      <Group label="Language">
        <LargeButton icon={<span className="text-[18px]">🌐</span>} label={'Language'} menu={[{ label: 'English (United States)', checked: true }, { label: 'Translate', disabled: true }]} />
      </Group>
      <Group label="Comments">
        <LargeButton icon={<CommentIcon />} label={'New\nComment'} onClick={() => openDialog('comment')} />
        <Col>
          <SmallButton label="Delete" onClick={() => import('../../state/comments').then((m) => m.deleteCommentAtCursor())} />
          <SmallButton label="Previous" onClick={() => import('../../state/comments').then((m) => m.stepComment(-1))} />
          <SmallButton label="Next" onClick={() => import('../../state/comments').then((m) => m.stepComment(1))} />
        </Col>
        <Col>
          <SmallButton label="Show Comments" checked={S().showComments} onClick={() => setState({ showComments: !S().showComments })} />
        </Col>
      </Group>
      <Group label="Tracking">
        <LargeButton icon={<TrackChangesIcon />} label={'Track\nChanges'} checked={track} onClick={() => setState({ trackChanges: !track })} title="Track Changes (Ctrl+Shift+E)" testId="track-changes" />
        <Col>
          <SmallButton label="All Markup" menu={[{ label: 'Simple Markup', disabled: true }, { label: 'All Markup', checked: true }, { label: 'No Markup', disabled: true }, { label: 'Original', disabled: true }]} />
          <SmallButton label="Show Markup" menu={[{ label: 'Insertions and Deletions', checked: true }, { label: 'Formatting', disabled: true }, { label: 'Comments', checked: S().showComments, onClick: () => setState({ showComments: !S().showComments }) }]} />
          <SmallButton label="Reviewing Pane" onClick={() => import('../../state/comments').then((m) => m.openReviewingPane())} />
        </Col>
      </Group>
      <Group label="Changes">
        <LargeButton icon={<AcceptIcon />} label={'Accept'} menu={[{ label: 'Accept and Move to Next', onClick: () => import('../../state/revisions').then((m) => m.acceptAtCursor(true)) }, { label: 'Accept This Change', onClick: () => import('../../state/revisions').then((m) => m.acceptAtCursor(false)) }, { label: 'Accept All Changes', onClick: () => import('../../state/revisions').then((m) => m.acceptAll()) }]} />
        <LargeButton icon={<RejectIcon />} label={'Reject'} menu={[{ label: 'Reject and Move to Next', onClick: () => import('../../state/revisions').then((m) => m.rejectAtCursor(true)) }, { label: 'Reject Change', onClick: () => import('../../state/revisions').then((m) => m.rejectAtCursor(false)) }, { label: 'Reject All Changes', onClick: () => import('../../state/revisions').then((m) => m.rejectAll()) }]} />
        <Col>
          <SmallButton label="Previous" onClick={() => import('../../state/revisions').then((m) => m.stepRevision(-1))} />
          <SmallButton label="Next" onClick={() => import('../../state/revisions').then((m) => m.stepRevision(1))} />
        </Col>
      </Group>
      <Group label="Compare">
        <LargeButton icon={<CompareIcon />} label={'Compare'} onClick={notYet('Compare')} />
      </Group>
      <Group label="Protect">
        <LargeButton icon={<ProtectIcon />} label={'Restrict\nEditing'} checked={mode === 'viewing'} onClick={() => setState({ editingMode: mode === 'viewing' ? 'editing' : 'viewing' })} />
      </Group>
    </>
  );
}

function zoomTo(kind: 'one' | 'multi' | 'width' | '100'): void {
  const el = document.querySelector('[data-testid=doc-scroller]') as HTMLElement | null;
  const page = getLayout().pages[0];
  if (!el || !page) return;
  if (kind === '100') return setState({ zoom: 100, multiPage: false });
  if (kind === 'width') return setState({ zoom: Math.max(10, Math.min(500, Math.floor(((el.clientWidth - 40) / page.w) * 100))), multiPage: false });
  if (kind === 'one') return setState({ zoom: Math.max(10, Math.min(500, Math.floor(((el.clientHeight - 40) / page.h) * 100))), multiPage: false });
  setState({ zoom: Math.max(10, Math.min(500, Math.floor(((el.clientWidth - 60) / (page.w * 2)) * 100))), multiPage: true });
}

export function ViewTab() {
  const view = useStore((s) => s.view);
  const ruler = useStore((s) => s.showRuler);
  const grid = useStore((s) => s.showGridlines);
  const nav = useStore((s) => s.showNav);
  const focus = useStore((s) => s.focusMode);
  const theme = useStore((s) => s.theme);
  const darkPage = useStore((s) => s.darkPage);
  return (
    <>
      <Group label="Views">
        <LargeButton icon={<ReadModeIcon />} label={'Read\nMode'} checked={view === 'read'} onClick={() => setState({ view: 'read' })} />
        <LargeButton icon={<PrintLayoutIcon />} label={'Print\nLayout'} checked={view === 'print'} onClick={() => setState({ view: 'print' })} testId="view-print" />
        <LargeButton icon={<WebLayoutIcon />} label={'Web\nLayout'} checked={view === 'web'} onClick={() => setState({ view: 'web' })} testId="view-web" />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><OutlineIcon /></span>} label="Outline" onClick={() => setState({ showNav: true, navTab: 'headings' })} />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><DraftIcon /></span>} label="Draft" checked={view === 'draft'} onClick={() => setState({ view: 'web' })} />
        </Col>
      </Group>
      <Group label="Immersive">
        <LargeButton icon={<FocusIcon />} label={'Focus'} checked={focus} onClick={() => setState({ focusMode: !focus })} />
        <LargeButton icon={<ReadAloudIcon />} label={'Immersive\nReader'} onClick={() => setState({ view: 'read' })} />
      </Group>
      <Group label="Page Movement">
        <LargeButton icon={<OnePageIcon />} label={'Vertical'} checked onClick={() => setState({ multiPage: false })} />
        <LargeButton icon={<MultiPageIcon />} label={'Side\nto Side'} onClick={() => zoomTo('multi')} />
      </Group>
      <Group label="Show">
        <Col>
          <label className="flex items-center gap-1.5 h-[22px] px-1 text-[12px]">
            <input type="checkbox" checked={ruler} onChange={() => setState({ showRuler: !ruler })} data-testid="show-ruler" /> <Ruler size={13} /> Ruler
          </label>
          <label className="flex items-center gap-1.5 h-[22px] px-1 text-[12px]">
            <input type="checkbox" checked={grid} onChange={() => setState({ showGridlines: !grid })} /> <Grid3x3 size={13} /> Gridlines
          </label>
          <label className="flex items-center gap-1.5 h-[22px] px-1 text-[12px]">
            <input type="checkbox" checked={nav} onChange={() => setState({ showNav: !nav })} data-testid="show-nav" /> <PanelLeft size={13} /> Navigation Pane
          </label>
        </Col>
      </Group>
      <Group label="Zoom">
        <LargeButton icon={<ZoomIcon />} label={'Zoom'} onClick={() => openDialog('zoom')} />
        <LargeButton icon={<Zoom100Icon />} label={'100%'} onClick={() => zoomTo('100')} />
        <Col>
          <SmallButton icon={<OnePageIcon />} label="One Page" onClick={() => zoomTo('one')} />
          <SmallButton icon={<MultiPageIcon />} label="Multiple Pages" onClick={() => zoomTo('multi')} />
          <SmallButton icon={<PageWidthIcon />} label="Page Width" onClick={() => zoomTo('width')} />
        </Col>
      </Group>
      <Group label="Window">
        <LargeButton icon={<NewWindowIcon />} label={'New\nWindow'} onClick={() => import('../../state/file').then((m) => m.newDocumentWindow())} />
        <Col>
          <SmallButton icon={<Moon size={14} />} label="Switch Modes" checked={darkPage} disabled={theme !== 'dark'} title={theme === 'dark' ? 'Switch the page to dark' : 'Available in the dark theme'} onClick={() => setState({ darkPage: !darkPage })} />
        </Col>
      </Group>
    </>
  );
}

export function HelpTab() {
  return (
    <>
      <Group label="Help">
        <LargeButton icon={<HelpIcon />} label={'Help'} onClick={() => openDialog('shortcuts')} />
        <LargeButton icon={<span className="text-[20px]">⌨</span>} label={'Keyboard\nShortcuts'} onClick={() => openDialog('shortcuts')} />
        <LargeButton icon={<span className="text-[20px]">ℹ</span>} label={'About\nMyWord'} onClick={() => setState({ backstage: true, backstagePage: 'about' })} />
      </Group>
    </>
  );
}

export function DrawTab() {
  const n = notYet('Drawing');
  return (
    <>
      <Group label="Drawing Tools">
        <LargeButton icon={<Pen size={22} />} label={'Draw'} onClick={n} />
        <LargeButton icon={<Highlighter size={22} />} label={'Highlighter'} onClick={n} />
        <LargeButton icon={<Eraser size={22} />} label={'Eraser'} onClick={n} />
      </Group>
      <Group label="Convert">
        <LargeButton icon={<span className="text-[18px]">◯</span>} label={'Ink to\nShape'} disabled />
        <LargeButton icon={<span className="text-[18px]">∑</span>} label={'Ink to\nMath'} disabled />
      </Group>
    </>
  );
}

export { setDocSettings };
