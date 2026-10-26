'use client';
import { Group, LargeButton, Col, SmallButton } from './parts';
import { insertToc, removeToc, setOutlineLevel, updateToc } from '../../state/toc';
import { alertBox, openDialog } from '../../state/store';
import { CaptionIcon, EnvelopeIcon, FootnoteIcon, LabelsIcon, MailMergeIcon, TocIcon } from '../icons';
import { RefreshCw, ListPlus } from 'lucide-react';

const notYet = (what: string) => () => alertBox(`${what} isn't available in MyWord yet.`, 'info');

export function ReferencesTab() {
  return (
    <>
      <Group label="Table of Contents">
        <LargeButton
          icon={<TocIcon />}
          label={'Table of\nContents'}
          menu={[
            { label: 'Automatic Table 1 (Contents)', onClick: () => insertToc(3, true) },
            { label: 'Automatic Table 2 (no title)', onClick: () => insertToc(3, false) },
            { label: 'Two levels', onClick: () => insertToc(2, true) },
            { separator: true },
            { label: 'Remove Table of Contents', onClick: removeToc },
          ]}
          testId="toc"
        />
        <Col>
          <SmallButton
            icon={<ListPlus size={15} />}
            label="Add Text"
            menu={[
              { label: 'Do Not Show in Table of Contents', onClick: () => setOutlineLevel(0) },
              { label: 'Level 1', onClick: () => setOutlineLevel(1) },
              { label: 'Level 2', onClick: () => setOutlineLevel(2) },
              { label: 'Level 3', onClick: () => setOutlineLevel(3) },
            ]}
          />
          <SmallButton icon={<RefreshCw size={14} />} label="Update Table" onClick={() => updateToc()} />
        </Col>
      </Group>
      <Group label="Footnotes" launcher={() => openDialog('footnote')}>
        <LargeButton icon={<FootnoteIcon />} label={'Insert\nFootnote'} title="Insert Footnote (Alt+Ctrl+F)" onClick={() => import('../../state/notes').then((m) => m.insertNote('footnote'))} testId="insert-footnote" />
        <Col>
          <SmallButton label="Insert Endnote" title="Insert Endnote (Alt+Ctrl+D)" onClick={() => import('../../state/notes').then((m) => m.insertNote('endnote'))} />
          <SmallButton label="Next Footnote" onClick={() => import('../../state/notes').then((m) => m.nextNote(1))} />
          <SmallButton label="Show Notes" onClick={() => import('../../state/notes').then((m) => m.showNotes())} />
        </Col>
      </Group>
      <Group label="Research">
        <LargeButton icon={<span className="text-[22px]">🔍</span>} label={'Search'} onClick={notYet('Research')} />
      </Group>
      <Group label="Citations & Bibliography">
        <LargeButton icon={<span className="text-[20px]">❝</span>} label={'Insert\nCitation'} onClick={notYet('Citations')} />
        <Col>
          <SmallButton label="Manage Sources" onClick={notYet('Citations')} />
          <SmallButton label="Style: APA" onClick={notYet('Citations')} />
          <SmallButton label="Bibliography" onClick={notYet('Bibliography')} />
        </Col>
      </Group>
      <Group label="Captions">
        <LargeButton icon={<CaptionIcon />} label={'Insert\nCaption'} onClick={() => openDialog('caption')} />
        <Col>
          <SmallButton label="Insert Table of Figures" onClick={notYet('Table of Figures')} />
          <SmallButton label="Update Table" onClick={() => updateToc()} />
          <SmallButton label="Cross-reference" onClick={notYet('Cross-reference')} />
        </Col>
      </Group>
      <Group label="Index">
        <LargeButton icon={<span className="text-[20px]">📑</span>} label={'Mark\nEntry'} onClick={notYet('Index')} />
      </Group>
    </>
  );
}

export function MailingsTab() {
  const n = notYet('Mailings');
  return (
    <>
      <Group label="Create">
        <LargeButton icon={<EnvelopeIcon />} label={'Envelopes'} onClick={n} />
        <LargeButton icon={<LabelsIcon />} label={'Labels'} onClick={n} />
      </Group>
      <Group label="Start Mail Merge">
        <LargeButton icon={<MailMergeIcon />} label={'Start Mail\nMerge'} onClick={n} />
        <LargeButton icon={<MailMergeIcon />} label={'Select\nRecipients'} onClick={n} />
        <LargeButton icon={<MailMergeIcon />} label={'Edit\nRecipient List'} disabled />
      </Group>
      <Group label="Write & Insert Fields">
        <LargeButton icon={<MailMergeIcon />} label={'Highlight\nMerge Fields'} disabled />
        <LargeButton icon={<MailMergeIcon />} label={'Address\nBlock'} disabled />
        <LargeButton icon={<MailMergeIcon />} label={'Greeting\nLine'} disabled />
      </Group>
      <Group label="Preview Results">
        <LargeButton icon={<MailMergeIcon />} label={'Preview\nResults'} disabled />
      </Group>
      <Group label="Finish">
        <LargeButton icon={<MailMergeIcon />} label={'Finish &\nMerge'} disabled />
      </Group>
    </>
  );
}
