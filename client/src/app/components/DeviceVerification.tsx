import type { VerificationRequestView } from '@harrier/core';
import React, { CSSProperties, useCallback } from 'react';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useIncomingVerification, useVerificationRequest } from '../hooks/useVerificationRequest';
import { useCore } from '../hooks/useCore';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { ContainerColor } from '../styles/ContainerColor.css';

const DialogHeaderStyles: CSSProperties = {
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
};

type WaitingMessageProps = {
  message: string;
};
function WaitingMessage({ message }: WaitingMessageProps) {
  return (
    <Box alignItems="Center" gap="200">
      <Spinner variant="Secondary" size="200" />
      <Text size="T300">{message}</Text>
    </Box>
  );
}

type VerificationUnexpectedProps = { message: string; onClose: () => void };
function VerificationUnexpected({ message, onClose }: VerificationUnexpectedProps) {
  return (
    <Box direction="Column" gap="400">
      <Text>{message}</Text>
      <Button variant="Secondary" fill="Soft" onClick={onClose}>
        <Text size="B400">Close</Text>
      </Button>
    </Box>
  );
}

function VerificationWaitAccept() {
  return (
    <Box direction="Column" gap="400">
      <Text>Please accept the request from other device.</Text>
      <WaitingMessage message="Waiting for request to be accepted..." />
    </Box>
  );
}

type VerificationAcceptProps = {
  onAccept: () => Promise<void>;
};
function VerificationAccept({ onAccept }: VerificationAcceptProps) {
  const [acceptState, accept] = useAsyncCallback(onAccept);

  const accepting = acceptState.status === AsyncStatus.Loading;
  return (
    <Box direction="Column" gap="400">
      <Text>Click accept to start the verification process.</Text>
      <Button
        variant="Primary"
        fill="Solid"
        onClick={accept}
        before={accepting && <Spinner size="100" variant="Primary" fill="Solid" />}
        disabled={accepting}
      >
        <Text size="B400">Accept</Text>
      </Button>
    </Box>
  );
}

function VerificationWaitStart() {
  return (
    <Box direction="Column" gap="400">
      <Text>Verification request has been accepted.</Text>
      <WaitingMessage message="Waiting for the response from other device..." />
    </Box>
  );
}

type VerificationStartProps = {
  onStart: () => Promise<void>;
};
function AutoVerificationStart({ onStart }: VerificationStartProps) {
  React.useEffect(() => {
    onStart();
  }, [onStart]);

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message="Starting verification using emoji comparison..." />
    </Box>
  );
}

type SasVerificationProps = {
  view: VerificationRequestView;
  onCancel: () => void;
};
function SasVerification({ view, onCancel }: SasVerificationProps) {
  const core = useCore();
  const { sas } = view;

  const handleConfirm = useCallback(async () => {
    const result = await core.crypto.verification.confirmSas(view.id);
    if (!result.ok) throw result.error;
  }, [core, view.id]);
  const handleMismatch = useCallback(() => {
    core.crypto.verification.mismatchSas(view.id).catch(() => undefined);
    onCancel();
  }, [core, view.id, onCancel]);

  const [confirmState, confirm] = useAsyncCallback(handleConfirm);
  const confirming =
    confirmState.status === AsyncStatus.Loading || confirmState.status === AsyncStatus.Success;

  if (!sas) {
    return (
      <Box direction="Column" gap="400">
        <WaitingMessage message="Starting verification using emoji comparison..." />
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="400">
      <Text>Confirm the emoji below are displayed on both devices, in the same order:</Text>
      <Box
        className={ContainerColor({ variant: 'SurfaceVariant' })}
        style={{
          borderRadius: config.radii.R400,
          padding: config.space.S500,
        }}
        gap="700"
        wrap="Wrap"
        justifyContent="Center"
      >
        {sas.emoji.map(({ emoji, name }, index) => (
          <Box
            // eslint-disable-next-line react/no-array-index-key
            key={`${emoji}${name}${index}`}
            direction="Column"
            gap="100"
            justifyContent="Center"
            alignItems="Center"
          >
            <Text size="H1">{emoji}</Text>
            <Text size="T200">{name}</Text>
          </Box>
        ))}
      </Box>
      <Box direction="Column" gap="200">
        <Button
          variant="Primary"
          fill="Soft"
          onClick={confirm}
          disabled={confirming}
          before={confirming && <Spinner size="100" variant="Primary" />}
        >
          <Text size="B400">They Match</Text>
        </Button>
        <Button variant="Primary" fill="Soft" onClick={handleMismatch} disabled={confirming}>
          <Text size="B400">Do not Match</Text>
        </Button>
      </Box>
    </Box>
  );
}

type VerificationDoneProps = {
  onExit: () => void;
};
function VerificationDone({ onExit }: VerificationDoneProps) {
  return (
    <Box direction="Column" gap="400">
      <div>
        <Text>Your device is verified.</Text>
      </div>
      <Button variant="Primary" fill="Solid" onClick={onExit}>
        <Text size="B400">Okay</Text>
      </Button>
    </Box>
  );
}

type VerificationCanceledProps = {
  onClose: () => void;
};
function VerificationCanceled({ onClose }: VerificationCanceledProps) {
  return (
    <Box direction="Column" gap="400">
      <Text>Verification has been canceled.</Text>
      <Button variant="Secondary" fill="Soft" onClick={onClose}>
        <Text size="B400">Close</Text>
      </Button>
    </Box>
  );
}

type DeviceVerificationProps = {
  view: VerificationRequestView;
  onExit: () => void;
};
export function DeviceVerification({ view, onExit }: DeviceVerificationProps) {
  const core = useCore();

  const handleCancel = useCallback(() => {
    if (view.phase !== 'done' && view.phase !== 'cancelled') {
      core.crypto.verification.cancel(view.id).catch(() => undefined);
    }
    onExit();
  }, [core, view.id, view.phase, onExit]);

  const handleAccept = useCallback(async () => {
    const result = await core.crypto.verification.accept(view.id);
    if (!result.ok) throw result.error;
  }, [core, view.id]);
  const handleStart = useCallback(async () => {
    const result = await core.crypto.verification.startSas(view.id);
    if (!result.ok) throw result.error;
  }, [core, view.id]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            escapeDeactivates: false,
          }}
        >
          <Dialog variant="Surface">
            <Header style={DialogHeaderStyles} variant="Surface" size="500">
              <Box grow="Yes">
                <Text size="H4">Device Verification</Text>
              </Box>
              <IconButton size="300" radii="300" onClick={handleCancel}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              {view.phase === 'requested' &&
                (view.initiatedByMe ? (
                  <VerificationWaitAccept />
                ) : (
                  <VerificationAccept onAccept={handleAccept} />
                ))}
              {view.phase === 'ready' &&
                (view.initiatedByMe ? (
                  <AutoVerificationStart onStart={handleStart} />
                ) : (
                  <VerificationWaitStart />
                ))}
              {view.phase === 'started' &&
                (view.hasVerifier ? (
                  <SasVerification view={view} onCancel={handleCancel} />
                ) : (
                  <VerificationUnexpected
                    message="Unexpected Error! Verification is started but verifier is missing."
                    onClose={handleCancel}
                  />
                ))}
              {view.phase === 'done' && <VerificationDone onExit={onExit} />}
              {view.phase === 'cancelled' && <VerificationCanceled onClose={handleCancel} />}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function ReceiveSelfDeviceVerification() {
  const incoming = useIncomingVerification();
  const view = useVerificationRequest(incoming?.id ?? '');

  if (!incoming || !incoming.isSelf || !view) return null;

  return <DeviceVerification view={view} onExit={() => undefined} />;
}
