import React, {
  ChangeEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Box, Button, color, config, Icon, Icons, Input, PopOut, RectCords, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useCustomStatus } from '../../../hooks/useCustomStatus';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  clearCustomStatus,
  DEFAULT_STATUS_PRESETS,
  setCustomStatusWithTime,
  StatusPreset,
  stripTimeSuffix,
} from '../../../plugins/custom-status';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { EmojiBoard } from '../../../components/emoji-board';

const MAX_STATUS_LENGTH = 60;

export function StatusEditor() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const currentStatus = useCustomStatus(userId);
  const currentEmoji = currentStatus?.emoji ?? '';
  const currentText = currentStatus?.text ?? '';

  const [customPresets, setCustomPresets] = useSetting(settingsAtom, 'statusPresets');
  const [statusNoticeRoomId] = useSetting(settingsAtom, 'statusNoticeRoomId');
  const allPresets = [...DEFAULT_STATUS_PRESETS, ...customPresets];

  const [adding, setAdding] = useState(false);
  const [addEmoji, setAddEmoji] = useState('');
  const [addText, setAddText] = useState('');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editEmoji, setEditEmoji] = useState('');
  const [editText, setEditText] = useState('');

  const [confirmingDeleteIndex, setConfirmingDeleteIndex] = useState<number | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!adding) {
      setAddEmoji('');
      setAddText('');
    }
  }, [adding]);

  useEffect(() => {
    if (editingIndex !== null) {
      setConfirmingDeleteIndex(null);
      setAdding(false);
    }
  }, [editingIndex]);

  useEffect(() => {
    if (confirmingDeleteIndex !== null) {
      setEditingIndex(null);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingDeleteIndex(null), 4000);
    }
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [confirmingDeleteIndex]);

  const isPresetActive = (preset: StatusPreset) =>
    currentEmoji === preset.emoji && stripTimeSuffix(currentText) === preset.text;

  const handleAddConfirm = useCallback(() => {
    if (!addEmoji) return;
    const newPreset: StatusPreset = { emoji: addEmoji, text: addText.trim() };
    setCustomPresets([...customPresets, newPreset]);
    setAdding(false);
  }, [addEmoji, addText, customPresets, setCustomPresets]);

  const handleRemovePreset = useCallback(
    (index: number) => {
      const removed = customPresets[index];
      if (!removed) return;
      setCustomPresets(customPresets.filter((_, i) => i !== index));
      if (currentEmoji === removed.emoji && stripTimeSuffix(currentText) === removed.text) {
        clearCustomStatus(mx);
      }
      setConfirmingDeleteIndex(null);
    },
    [customPresets, setCustomPresets, currentEmoji, currentText, mx]
  );

  const handleDeleteClick = useCallback(
    (customIndex: number) => {
      if (confirmingDeleteIndex === customIndex) {
        handleRemovePreset(customIndex);
      } else {
        setConfirmingDeleteIndex(customIndex);
      }
    },
    [confirmingDeleteIndex, handleRemovePreset]
  );

  const handleEditStart = useCallback((customIndex: number, preset: StatusPreset) => {
    setEditingIndex(customIndex);
    setEditEmoji(preset.emoji);
    setEditText(preset.text);
    setConfirmingDeleteIndex(null);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editEmoji || editingIndex === null) return;
    const newEmoji = editEmoji;
    const newText = editText.trim();
    const updated = customPresets.map((p, i) =>
      i === editingIndex ? { emoji: newEmoji, text: newText } : p
    );
    setCustomPresets(updated);
    if (
      currentEmoji === customPresets[editingIndex].emoji &&
      stripTimeSuffix(currentText) === customPresets[editingIndex].text
    ) {
      setCustomStatusWithTime(mx, newEmoji, newText, statusNoticeRoomId);
    }
    setEditingIndex(null);
  }, [
    editEmoji,
    editText,
    editingIndex,
    customPresets,
    setCustomPresets,
    currentEmoji,
    currentText,
    mx,
    statusNoticeRoomId,
  ]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleAddClick = useCallback(() => {
    setAdding(true);
    setEditingIndex(null);
    setConfirmingDeleteIndex(null);
  }, []);

  return (
    <Box direction="Column" gap="200">
      {allPresets.map((preset, idx) => {
        const customIndex = idx - DEFAULT_STATUS_PRESETS.length;
        const isCustom = customIndex >= 0;
        const active = isPresetActive(preset);

        if (isCustom && editingIndex === customIndex) {
          return (
            <Box
              key={`${preset.emoji}-${preset.text}`}
              direction="Column"
              gap="200"
              style={{ padding: config.space.S200 }}
            >
              <Box gap="200" alignItems="Center">
                <UseStateProvider initial={undefined}>
                  {(cords: RectCords | undefined, setCords) => (
                    <PopOut
                      position="Bottom"
                      anchor={cords}
                      content={
                        <EmojiBoard
                          imagePackRooms={[]}
                          returnFocusOnDeactivate={false}
                          allowTextCustomEmoji={false}
                          addToRecentEmoji={false}
                          onEmojiSelect={(key) => {
                            setEditEmoji(key);
                            setCords(undefined);
                          }}
                          requestClose={() => setCords(undefined)}
                        />
                      }
                    >
                      <Button
                        onClick={
                          ((evt) =>
                            setCords(
                              evt.currentTarget.getBoundingClientRect()
                            )) as MouseEventHandler<HTMLButtonElement>
                        }
                        size="400"
                        variant="Secondary"
                        fill="Soft"
                        outlined
                        radii="300"
                        aria-label="Select status emoji"
                      >
                        {editEmoji ? (
                          <Text size="H4">{editEmoji}</Text>
                        ) : (
                          <Icon size="100" src={Icons.SmilePlus} />
                        )}
                      </Button>
                    </PopOut>
                  )}
                </UseStateProvider>
                <Box grow="Yes" direction="Column">
                  <Input
                    value={editText}
                    onChange={
                      ((evt) =>
                        setEditText(
                          evt.currentTarget.value
                        )) as ChangeEventHandler<HTMLInputElement>
                    }
                    variant="Secondary"
                    radii="300"
                    maxLength={MAX_STATUS_LENGTH}
                    placeholder="Edit status text"
                  />
                </Box>
              </Box>
              <Box gap="200">
                <Button
                  size="300"
                  variant="Success"
                  fill={editEmoji ? 'Solid' : 'Soft'}
                  outlined
                  radii="300"
                  disabled={!editEmoji}
                  onClick={handleEditSave}
                >
                  <Text size="B300">Save</Text>
                </Button>
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  onClick={handleEditCancel}
                >
                  <Text size="B300">Cancel</Text>
                </Button>
              </Box>
            </Box>
          );
        }

        return (
          <Box
            key={`${preset.emoji}-${preset.text}`}
            gap="200"
            alignItems="Center"
            style={{
              padding: config.space.S200,
              borderRadius: config.radii.R300,
              border: 'none',
              background: active ? color.SurfaceVariant.Container : 'transparent',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <Text size="T400">{preset.emoji}</Text>
            <Box grow="Yes">
              <Text size="T300" truncate>
                {preset.text}
              </Text>
            </Box>
            {active && <Icon size="50" src={Icons.Check} />}
            {isCustom && (
              <>
                <Box
                  as="button"
                  onClick={() => handleEditStart(customIndex, preset)}
                  aria-label="Edit preset"
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  <Icon size="50" src={Icons.Pencil} />
                </Box>
                <Box
                  as="button"
                  onClick={() => handleDeleteClick(customIndex)}
                  aria-label="Delete preset"
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background:
                      confirmingDeleteIndex === customIndex
                        ? color.Critical.Container
                        : 'transparent',
                    color:
                      confirmingDeleteIndex === customIndex
                        ? color.Critical.OnContainer
                        : 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: 1,
                    padding: '2px 6px',
                    borderRadius: config.radii.R300,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {confirmingDeleteIndex === customIndex ? (
                    <Text size="B300">Delete?</Text>
                  ) : (
                    <Icon size="50" src={Icons.Delete} />
                  )}
                </Box>
              </>
            )}
          </Box>
        );
      })}

      {adding ? (
        <Box direction="Column" gap="200" style={{ padding: config.space.S200 }}>
          <Box gap="200" alignItems="Center">
            <UseStateProvider initial={undefined}>
              {(cords: RectCords | undefined, setCords) => (
                <PopOut
                  position="Bottom"
                  anchor={cords}
                  content={
                    <EmojiBoard
                      imagePackRooms={[]}
                      returnFocusOnDeactivate={false}
                      allowTextCustomEmoji={false}
                      addToRecentEmoji={false}
                      onEmojiSelect={(key) => {
                        setAddEmoji(key);
                        setCords(undefined);
                      }}
                      requestClose={() => setCords(undefined)}
                    />
                  }
                >
                  <Button
                    onClick={
                      ((evt) =>
                        setCords(
                          evt.currentTarget.getBoundingClientRect()
                        )) as MouseEventHandler<HTMLButtonElement>
                    }
                    size="400"
                    variant="Secondary"
                    fill="Soft"
                    outlined
                    radii="300"
                    aria-label="Select status emoji"
                  >
                    {addEmoji ? (
                      <Text size="H4">{addEmoji}</Text>
                    ) : (
                      <Icon size="100" src={Icons.SmilePlus} />
                    )}
                  </Button>
                </PopOut>
              )}
            </UseStateProvider>
            <Box grow="Yes" direction="Column">
              <Input
                value={addText}
                onChange={
                  ((evt) =>
                    setAddText(evt.currentTarget.value)) as ChangeEventHandler<HTMLInputElement>
                }
                variant="Secondary"
                radii="300"
                maxLength={MAX_STATUS_LENGTH}
                placeholder="What's your status?"
              />
            </Box>
          </Box>
          <Box gap="200">
            <Button
              size="300"
              variant="Success"
              fill={addEmoji ? 'Solid' : 'Soft'}
              outlined
              radii="300"
              disabled={!addEmoji}
              onClick={handleAddConfirm}
            >
              <Text size="B300">Add</Text>
            </Button>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() => setAdding(false)}
            >
              <Text size="B300">Cancel</Text>
            </Button>
          </Box>
        </Box>
      ) : (
        <Box
          as="button"
          onClick={handleAddClick}
          gap="200"
          alignItems="Center"
          style={{
            padding: config.space.S200,
            borderRadius: config.radii.R300,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            textAlign: 'left',
            width: '100%',
          }}
        >
          <Icon size="100" src={Icons.Plus} />
          <Text size="T300" priority="300">
            Custom
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function ProfileStatus() {
  const [statusNoticeRoomId, setStatusNoticeRoomId] = useSetting(
    settingsAtom,
    'statusNoticeRoomId'
  );
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Status</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={
            <Text as="span" size="L400">
              Custom Status
            </Text>
          }
          description={
            <Text size="T200" priority="300">
              Share an emoji and a short message with everyone.
            </Text>
          }
        >
          <StatusEditor />
        </SettingTile>
        <SettingTile
          title={
            <Text as="span" size="L400">
              Status Notice Room
            </Text>
          }
          description={
            <Text size="T200" priority="300">
              Room ID to send an m.notice message when your status changes. Leave empty to disable.
            </Text>
          }
        >
          <Input
            value={statusNoticeRoomId ?? ''}
            onChange={
              ((evt) =>
                setStatusNoticeRoomId(
                  evt.currentTarget.value
                )) as ChangeEventHandler<HTMLInputElement>
            }
            variant="Secondary"
            radii="300"
            placeholder="!roomId:example.org"
          />
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
