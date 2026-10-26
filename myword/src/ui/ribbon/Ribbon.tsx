'use client';
import { ChevronDown, ChevronUp, MessageSquare, Pencil, Share2, Eye, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { NodeSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { activeState, getSurface } from '../../state/editor';
import { RibbonTab, S, setState, useStore } from '../../state/store';
import { N } from '../../model/schema';
import { HomeTab } from './HomeTab';
import { InsertTab } from './InsertTab';
import { DesignTab, LayoutTab } from './LayoutTab';
import { ReferencesTab, MailingsTab } from './ReferencesTab';
import { HelpTab, ReviewTab, ViewTab, DrawTab } from './ReviewTab';
import { EquationTab, HeaderFooterTab, PictureFormatTab, ShapeFormatTab, TableDesignTab, TableLayoutTab } from './ContextTabs';
import { Menu } from '../Menu';

const TABS: RibbonTab[] = ['Home', 'Insert', 'Draw', 'Design', 'Layout', 'References', 'Mailings', 'Review', 'View', 'Help'];

function inTable(): boolean {
  const s = activeState();
  if (s.selection instanceof CellSelection) return true;
  const $p = s.selection.$from;
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) return true;
  return false;
}

function selectedNodeType(): 'image' | 'obj' | 'equation' | null {
  const s = activeState().selection;
  if (!(s instanceof NodeSelection)) return null;
  return s.node.type === N.image ? 'image' : s.node.type === N.obj ? 'obj' : s.node.type === N.equation ? 'equation' : null;
}

export function Ribbon() {
  const tab = useStore((s) => s.ribbonTab);
  const collapsed = useStore((s) => s.ribbonCollapsed);
  const mode = useStore((s) => s.editingMode);
  useStore((s) => s.rev);
  const [peek, setPeek] = useState(false);
  const [modeMenu, setModeMenu] = useState<{ x: number; y: number } | null>(null);
  const surf = getSurface();
  const ctx: RibbonTab[] = [];
  if (surf.kind === 'header' || surf.kind === 'footer') ctx.push('Header & Footer');
  if (inTable()) ctx.push('Table Design', 'Table Layout');
  const objSel = selectedNodeType();
  if (objSel === 'image') ctx.push('Picture Format');
  if (objSel === 'obj' || surf.kind === 'textbox') ctx.push('Shape Format');
  if (objSel === 'equation') ctx.push('Equation');
  const current: RibbonTab = TABS.includes(tab) || ctx.includes(tab) ? tab : 'Home';
  const showBody = !collapsed || peek;
  const modeIcon = mode === 'editing' ? <Pencil size={14} /> : mode === 'reviewing' ? <MessageSquareText size={14} /> : <Eye size={14} />;
  const modeLabel = mode === 'editing' ? 'Editing' : mode === 'reviewing' ? 'Reviewing' : 'Viewing';
  return (
    <div className="flex flex-col px-2 pb-1" style={{ background: 'var(--chrome-bg)' }} data-testid="ribbon">
      <div className="flex items-center h-[32px] gap-[2px]" role="tablist">
        <button className="mw-tab" data-testid="tab-File" onClick={() => setState({ backstage: true, backstagePage: 'home' })}>
          File
        </button>
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={current === t}
            data-testid={`tab-${t}`}
            className={'mw-tab ' + (current === t ? 'mw-tab-active' : '')}
            onClick={() => {
              if (collapsed) setPeek(!(peek && current === t));
              setState({ ribbonTab: t });
            }}
            onDoubleClick={() => setState({ ribbonCollapsed: !collapsed })}
          >
            {t}
          </button>
        ))}
        {ctx.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={current === t}
            className={'mw-tab ' + (current === t ? 'mw-tab-active' : '')}
            style={{ color: current === t ? undefined : 'var(--accent)' }}
            onClick={() => setState({ ribbonTab: t })}
            data-testid={`tab-${t}`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1" />
        <button className="mw-btn-sm !h-[28px] !px-2 border !border-[var(--border-strong)] rounded-[4px] mr-1" title="Comments" onClick={() => setState({ showComments: !S().showComments })}>
          <MessageSquare size={15} /> Comments
        </button>
        <button className="mw-btn-sm !h-[28px] !px-2 border !border-[var(--border-strong)] rounded-[4px] mr-1" title="Editing mode" onClick={(e) => setModeMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom + 2 })}>
          {modeIcon} {modeLabel} <ChevronDown size={12} />
        </button>
        <button className="flex items-center gap-1.5 h-[28px] px-3 rounded-[4px] text-white" style={{ background: 'var(--brand)' }} title="Share" onClick={() => setState({ backstage: true, backstagePage: 'share' })}>
          <Share2 size={14} /> Share <ChevronDown size={12} />
        </button>
        {modeMenu && (
          <Menu
            x={modeMenu.x}
            y={modeMenu.y}
            minWidth={250}
            onClose={() => setModeMenu(null)}
            items={[
              { label: 'Editing', icon: <Pencil size={14} />, checked: mode === 'editing', onClick: () => setState({ editingMode: 'editing', trackChanges: false }) },
              { label: 'Reviewing', icon: <MessageSquareText size={14} />, checked: mode === 'reviewing', onClick: () => setState({ editingMode: 'reviewing', trackChanges: true }) },
              { label: 'Viewing', icon: <Eye size={14} />, checked: mode === 'viewing', onClick: () => setState({ editingMode: 'viewing' }) },
            ]}
          />
        )}
      </div>
      {showBody && (
        <div className="mw-ribbon flex items-stretch h-[96px] relative overflow-x-auto overflow-y-hidden" onClick={() => collapsed && setTimeout(() => setPeek(false), 0)}>
          <div className="flex items-stretch py-[2px]">
            {current === 'Home' && <HomeTab />}
            {current === 'Insert' && <InsertTab />}
            {current === 'Draw' && <DrawTab />}
            {current === 'Design' && <DesignTab />}
            {current === 'Layout' && <LayoutTab />}
            {current === 'References' && <ReferencesTab />}
            {current === 'Mailings' && <MailingsTab />}
            {current === 'Review' && <ReviewTab />}
            {current === 'View' && <ViewTab />}
            {current === 'Help' && <HelpTab />}
            {current === 'Header & Footer' && <HeaderFooterTab />}
            {current === 'Table Design' && <TableDesignTab />}
            {current === 'Table Layout' && <TableLayoutTab />}
            {current === 'Picture Format' && <PictureFormatTab />}
            {current === 'Shape Format' && <ShapeFormatTab />}
            {current === 'Equation' && <EquationTab />}
          </div>
          <div className="flex-1" />
          <button className="absolute right-1 bottom-1 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--hover)]" title="Collapse the Ribbon (Ctrl+F1)" onClick={() => setState({ ribbonCollapsed: !S().ribbonCollapsed })}>
            <ChevronUp size={14} className={collapsed ? 'rotate-180' : ''} />
          </button>
        </div>
      )}
    </div>
  );
}
