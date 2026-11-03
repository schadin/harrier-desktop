/* eslint-disable no-param-reassign -- permission editors apply changes to (immer) drafts in place */
export type PowerLevelActions = 'invite' | 'redact' | 'kick' | 'ban' | 'historical';
export type PowerLevelNotificationsAction = 'room';

export type IPowerLevels = {
  users_default?: number;
  state_default?: number;
  events_default?: number;
  historical?: number;
  invite?: number;
  redact?: number;
  kick?: number;
  ban?: number;

  events?: Record<string, number>;
  users?: Record<string, number>;
  notifications?: Record<string, number>;
};

const DEFAULT_POWER_LEVELS: Required<IPowerLevels> = {
  users_default: 0,
  state_default: 50,
  events_default: 0,
  invite: 0,
  redact: 50,
  kick: 50,
  ban: 50,
  historical: 0,
  events: {},
  users: {},
  notifications: {
    room: 50,
  },
};

export const fillMissingPowers = (powerLevels: IPowerLevels): IPowerLevels => {
  const notifications = {
    ...DEFAULT_POWER_LEVELS.notifications,
    ...powerLevels.notifications,
  };
  if (typeof notifications.room !== 'number') notifications.room = 50;

  return {
    ...DEFAULT_POWER_LEVELS,
    ...powerLevels,
    events: { ...powerLevels.events },
    users: { ...powerLevels.users },
    notifications,
  };
};

export type ReadPowerLevelAPI = {
  user: (powerLevels: IPowerLevels, userId: string | undefined) => number;
  event: (powerLevels: IPowerLevels, eventType: string | undefined) => number;
  state: (powerLevels: IPowerLevels, eventType: string | undefined) => number;
  action: (powerLevels: IPowerLevels, action: PowerLevelActions) => number;
  notification: (powerLevels: IPowerLevels, action: PowerLevelNotificationsAction) => number;
};

export const readPowerLevel: ReadPowerLevelAPI = {
  user: (powerLevels, userId) => {
    const { users_default: usersDefault, users } = powerLevels;

    if (userId && users && typeof users[userId] === 'number') {
      return users[userId];
    }
    return usersDefault ?? DEFAULT_POWER_LEVELS.users_default;
  },
  event: (powerLevels, eventType) => {
    const { events, events_default: eventsDefault } = powerLevels;
    if (events && eventType && typeof events[eventType] === 'number') {
      return events[eventType];
    }
    return eventsDefault ?? DEFAULT_POWER_LEVELS.events_default;
  },
  state: (powerLevels, eventType) => {
    const { events, state_default: stateDefault } = powerLevels;
    if (events && eventType && typeof events[eventType] === 'number') {
      return events[eventType];
    }
    return stateDefault ?? DEFAULT_POWER_LEVELS.state_default;
  },
  action: (powerLevels, action) => {
    const powerLevel = powerLevels[action];
    if (typeof powerLevel === 'number') {
      return powerLevel;
    }
    return DEFAULT_POWER_LEVELS[action];
  },
  notification: (powerLevels, action) => {
    const powerLevel = powerLevels.notifications?.[action];
    if (typeof powerLevel === 'number') {
      return powerLevel;
    }
    return DEFAULT_POWER_LEVELS.notifications[action];
  },
};

type DefaultPermissionLocation = {
  user: true;
  key?: string;
};

type ActionPermissionLocation = {
  action: true;
  key: PowerLevelActions;
};

type EventPermissionLocation = {
  state?: true;
  key?: string;
};

type NotificationPermissionLocation = {
  notification: true;
  key: PowerLevelNotificationsAction;
};

export type PermissionLocation =
  | DefaultPermissionLocation
  | ActionPermissionLocation
  | EventPermissionLocation
  | NotificationPermissionLocation;

export const getPermissionPower = (
  powerLevels: IPowerLevels,
  location: PermissionLocation
): number => {
  if ('user' in location) {
    return readPowerLevel.user(powerLevels, location.key);
  }
  if ('action' in location) {
    return readPowerLevel.action(powerLevels, location.key);
  }
  if ('notification' in location) {
    return readPowerLevel.notification(powerLevels, location.key);
  }
  if ('state' in location) {
    return readPowerLevel.state(powerLevels, location.key);
  }

  return readPowerLevel.event(powerLevels, location.key);
};

export const applyPermissionPower = (
  powerLevels: IPowerLevels,
  location: PermissionLocation,
  power: number
): IPowerLevels => {
  if ('user' in location) {
    if (typeof location.key === 'string') {
      const users = powerLevels.users ?? {};
      users[location.key] = power;
      powerLevels.users = users;
      return powerLevels;
    }
    powerLevels.users_default = power;
    return powerLevels;
  }
  if ('action' in location) {
    powerLevels[location.key] = power;
    return powerLevels;
  }
  if ('notification' in location) {
    const notifications = powerLevels.notifications ?? {};
    notifications[location.key] = power;
    powerLevels.notifications = notifications;
    return powerLevels;
  }
  if ('state' in location) {
    if (typeof location.key === 'string') {
      const events = powerLevels.events ?? {};
      events[location.key] = power;
      powerLevels.events = events;
      return powerLevels;
    }
    powerLevels.state_default = power;
    return powerLevels;
  }

  if (typeof location.key === 'string') {
    const events = powerLevels.events ?? {};
    events[location.key] = power;
    powerLevels.events = events;
    return powerLevels;
  }
  powerLevels.events_default = power;
  return powerLevels;
};

export type RoomPermissionsAPI = {
  event: (type: string, userId: string) => boolean;
  stateEvent: (type: string, userId: string) => boolean;
  action: (action: PowerLevelActions, userId: string) => boolean;
  notificationAction: (action: PowerLevelNotificationsAction, userId: string) => boolean;
};

export const getRoomPermissionsAPI = (
  creators: Set<string> | readonly string[],
  powerLevels: IPowerLevels
): RoomPermissionsAPI => {
  const creatorSet = creators instanceof Set ? creators : new Set(creators);
  const api: RoomPermissionsAPI = {
    event: (type, userId) => {
      if (creatorSet.has(userId)) return true;
      const userPower = readPowerLevel.user(powerLevels, userId);
      const requiredPL = readPowerLevel.event(powerLevels, type);
      return userPower >= requiredPL;
    },
    stateEvent: (type, userId) => {
      if (creatorSet.has(userId)) return true;
      const userPower = readPowerLevel.user(powerLevels, userId);
      const requiredPL = readPowerLevel.state(powerLevels, type);
      return userPower >= requiredPL;
    },
    action: (action, userId) => {
      if (creatorSet.has(userId)) return true;
      const userPower = readPowerLevel.user(powerLevels, userId);
      const requiredPL = readPowerLevel.action(powerLevels, action);
      return userPower >= requiredPL;
    },
    notificationAction: (action, userId) => {
      if (creatorSet.has(userId)) return true;
      const userPower = readPowerLevel.user(powerLevels, userId);
      const requiredPL = readPowerLevel.notification(powerLevels, action);
      return userPower >= requiredPL;
    },
  };

  return api;
};
