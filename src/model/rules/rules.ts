import * as _ from 'lodash';
import {
    versionSatisfies,
    BODY_MATCHING_RANGE,
    HOST_MATCHER_SERVER_RANGE,
    FROM_FILE_HANDLER_SERVER_RANGE,
    PASSTHROUGH_TRANSFORMS_RANGE
} from '../../services/service-versions';

import {
    MethodMatchers,
    WildcardMatcher,
    StaticResponseHandler,
    ForwardToHostHandler,
    TimeoutHandler,
    CloseConnectionHandler,
    FromFileResponseHandler,
    TransformingHandler,
    HttpMatcherLookup,
    HttpHandlerLookup,
    HttpMockRule,
    HttpInitialMatcherClasses
} from './definitions/http-rule-definitions';

import {
    WebSocketMatcherLookup,
    WebSocketHandlerLookup,
    WebSocketMockRule,
    WebSocketWildcardMatcher
} from './definitions/websocket-rule-definitions';

/// --- Part-generic logic ---

const PartVersionRequirements: {
    [PartType in keyof typeof MatcherLookup | keyof typeof HandlerLookup]?: string
} = {
    // Matchers:
    'host': HOST_MATCHER_SERVER_RANGE,
    'raw-body': BODY_MATCHING_RANGE,
    'raw-body-regexp': BODY_MATCHING_RANGE,
    'raw-body-includes': BODY_MATCHING_RANGE,
    'json-body': BODY_MATCHING_RANGE,
    'json-body-matching': BODY_MATCHING_RANGE,

    // Handlers:
    'file': FROM_FILE_HANDLER_SERVER_RANGE,
    'req-res-transformer': PASSTHROUGH_TRANSFORMS_RANGE
};

/// --- Matchers ---

const MatchersByType = {
    'http': HttpMatcherLookup,
    'websocket': WebSocketMatcherLookup
};

// Define maps to/from matcher keys to matcher classes, and
// types for the matchers & classes themselves; both the built-in
// ones and our own extra additions & overrides.
export const MatcherLookup = {
    // These are kept as references to MatchersByType, so the content is always the same:
    ...MatchersByType['http'],
    ...MatchersByType['websocket']
};

export type MatcherClassKey = keyof typeof MatcherLookup;
export type MatcherClass = typeof MatcherLookup[MatcherClassKey];
export type Matcher = typeof MatcherLookup extends {
    // Enforce that keys match .type or uiType for each matcher class:
    [K in keyof typeof MatcherLookup]: new (...args: any[]) => { type: K } | { uiType: K }
}
    ? InstanceType<MatcherClass>
    : never;

// A runtime map from class to the 'uiType'/'type' key that will be
// present on constructed instances.
export const MatcherClassKeyLookup = new Map<MatcherClass, MatcherClassKey>(
    Object.entries(MatcherLookup)
    .map(
        ([key, matcher]) => [matcher, key]
    ) as Array<[MatcherClass, MatcherClassKey]>
);

/// --- Handlers ---

export const HandlersByType = {
    'http': HttpHandlerLookup,
    'websocket': WebSocketHandlerLookup
};

// Define maps to/from handler keys to handler classes, and
// types for the handlers & classes themselves; both the built-in
// ones and our own extra additions & overrides.
export const HandlerLookup = {
    // These are kept as references to HandlersByType, so the content is always the same:
    ...HandlersByType['http'],
    ...HandlersByType['websocket']
};

export type HandlerClassKey = keyof typeof HandlerLookup;
export type HandlerClass = typeof HandlerLookup[HandlerClassKey];
export type Handler = typeof HandlerLookup extends {
    // Enforce that keys match .type or uiType for each handler class:
    [K in keyof typeof HandlerLookup]: new (...args: any[]) => { type: K } | { uiType: K }
}
    ? InstanceType<HandlerClass>
    : never;

export const HandlerClassKeyLookup = new Map<HandlerClass, HandlerClassKey>(
    Object.entries(HandlerLookup)
    .map(
        ([key, handler]) => [handler, key]
    ) as Array<[HandlerClass, HandlerClassKey]>
);

/// --- Matcher/handler special categories ---

export const InitialMatcherClasses = [
    WildcardMatcher,
    ...Object.values(MethodMatchers)
];
export type InitialMatcherClass = typeof InitialMatcherClasses[0];
export type InitialMatcher = InstanceType<InitialMatcherClass>;

// Some real matchers aren't shown in the selection dropdowns, either because they're not suitable
// for use here, or because we just don't support them yet:
const HiddenMatchers: readonly MatcherClassKey[] = [
    'callback',
    'am-i-using',
    'default-wildcard',
    'method',
    'multipart-form-data',
    'raw-body-regexp',
    'hostname',
    'port',
    'protocol',
    'form-data',
    'cookie',
    'default-ws-wildcard'
] as const;

type HiddenMatcherKey = typeof HiddenMatchers[number];

// The set of non-initial matchers a user can pick for a given rule.
export const getAvailableAdditionalMatchers = (
    ruleType: RuleType,
    serverVersion: string | undefined
) => {
    return Object.values(MatchersByType[ruleType])
        .filter((matcher) => {
            const matcherKey = MatcherClassKeyLookup.get(matcher)!;

            if (HiddenMatchers.includes(matcherKey as HiddenMatcherKey)) return false;
            if (InitialMatcherClasses.includes(matcher as InitialMatcherClass)) return false;

            const versionRequirement = PartVersionRequirements[matcherKey];
            return !versionRequirement || versionSatisfies(serverVersion, versionRequirement);
        });
};

const HiddenHandlers = [
    'ws-reject',
    'ws-listen',
    'ws-echo',
    'callback',
    'stream'
] as const;

type HiddenHandlerKey = typeof HiddenHandlers[number];

export const getAvailableHandlers = (ruleType: RuleType, serverVersion: string | undefined) => {
    return Object.values(HandlersByType[ruleType])
        .filter((handler) => {
            const handlerKey = HandlerClassKeyLookup.get(handler)!;

            if (HiddenHandlers.includes(handlerKey as HiddenHandlerKey)) return false;

            const versionRequirement = PartVersionRequirements[handlerKey];
            return !versionRequirement || versionSatisfies(serverVersion, versionRequirement);
        });
};

const PaidHandlerClasses: HandlerClass[] = [
    StaticResponseHandler,
    FromFileResponseHandler,
    ForwardToHostHandler,
    TransformingHandler,
    TimeoutHandler,
    CloseConnectionHandler
];

export const isPaidHandler = (handler: Handler) => {
    return _.some(PaidHandlerClasses, (cls) => handler instanceof cls);
}

export const isPaidHandlerClass = (handlerClass: HandlerClass) => {
    return PaidHandlerClasses.includes(handlerClass);
}

/// --- Rules ---

export type HtkMockRule =
    | WebSocketMockRule
    | HttpMockRule;

export type RuleType = HtkMockRule['type'];

const matchRuleType = <T extends RuleType>(
    type: T
) => (rule: HtkMockRule): rule is HtkMockRule & { type: T } =>
    rule.type === type;

export const isHttpRule = matchRuleType('http');
export const isWebSocketRule = matchRuleType('websocket');