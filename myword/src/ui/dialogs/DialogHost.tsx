'use client';
import { useStore } from '../../state/store';
import { AboutDialog, AlertDialog, BookmarkDialog, CaptionDialog, ColumnsDialog, CommentDialog, ConfirmDialog, DateTimeDialog, ImageDialog, InsertTableDialog, LinkDialog, ListLevelDialog, PageNumberFormatDialog, PasteSpecialDialog, RecoveryDialog, RenameDialog, ShortcutsDialog, SortDialog, SymbolDialog, WatermarkDialog, WordCountDialog, ZoomDialog, TabsDialog, FootnoteDialog } from './basic';
import { FontDialog } from './FontDialog';
import { ParagraphDialog } from './ParagraphDialog';
import { FindReplaceDialog } from './FindReplace';
import { PageSetupDialog } from './PageSetup';
import { BordersShadingDialog } from './BordersShading';
import { StyleModifyDialog } from './StyleModify';
import { TablePropsDialog } from './TableProps';
import { SpellingDialog } from './Spelling';
import { ChartDialog, DropCapDialog, EquationDialog, SmartArtDialog } from './ObjectDialogs';

export function DialogHost() {
  const d = useStore((s) => s.dialog);
  if (!d) return null;
  const p = d.props ?? {};
  switch (d.name) {
    case 'alert':
      return <AlertDialog {...(p as { message: string })} />;
    case 'confirm':
      return <ConfirmDialog {...(p as { message: string; buttons: string[]; onResult: (b: string) => void })} />;
    case 'recovery':
      return <RecoveryDialog {...(p as { fileName: string; savedAt: number; onRecover: () => void; onDiscard: () => void })} />;
    case 'about':
      return <AboutDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'saveAs':
      return <RenameDialog />;
    case 'wordCount':
      return <WordCountDialog />;
    case 'zoom':
      return <ZoomDialog />;
    case 'link':
      return <LinkDialog />;
    case 'symbol':
      return <SymbolDialog />;
    case 'dateTime':
      return <DateTimeDialog />;
    case 'insertTable':
      return <InsertTableDialog />;
    case 'columns':
      return <ColumnsDialog />;
    case 'watermark':
      return <WatermarkDialog />;
    case 'image':
      return <ImageDialog />;
    case 'sort':
      return <SortDialog />;
    case 'listLevel':
      return <ListLevelDialog />;
    case 'pageNumberFormat':
      return <PageNumberFormatDialog />;
    case 'pasteSpecial':
      return <PasteSpecialDialog />;
    case 'bookmark':
      return <BookmarkDialog />;
    case 'comment':
      return <CommentDialog />;
    case 'caption':
      return <CaptionDialog />;
    case 'tabs':
      return <TabsDialog />;
    case 'footnote':
      return <FootnoteDialog />;
    case 'spelling':
      return <SpellingDialog />;
    case 'equation':
      return <EquationDialog pos={p.pos as number | undefined} />;
    case 'chart':
      return <ChartDialog pos={p.pos as number} />;
    case 'smartart':
      return <SmartArtDialog pos={p.pos as number | undefined} create={!!p.create} />;
    case 'dropCap':
      return <DropCapDialog />;
    case 'font':
      return <FontDialog />;
    case 'paragraph':
      return <ParagraphDialog tab={(p.tab as 'indents' | 'breaks') ?? 'indents'} />;
    case 'findReplace':
      return <FindReplaceDialog tab={(p.tab as 'find' | 'replace' | 'goto') ?? 'find'} />;
    case 'pageSetup':
      return <PageSetupDialog tab={(p.tab as 'margins' | 'paper' | 'layout') ?? 'margins'} />;
    case 'bordersShading':
      return <BordersShadingDialog tab={(p.tab as 'borders' | 'page' | 'shading') ?? 'borders'} />;
    case 'styleModify':
      return <StyleModifyDialog id={p.id as string | undefined} create={!!p.create} />;
    case 'tableProps':
      return <TablePropsDialog tab={(p.tab as 'table' | 'row' | 'column' | 'cell') ?? 'table'} />;
    default:
      return null;
  }
}
