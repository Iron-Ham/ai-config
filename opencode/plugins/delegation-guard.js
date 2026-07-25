const MAX_PENDING_CALLS = 1000;

function taskArguments(args) {
  if (args && typeof args === "object" && !Array.isArray(args)) return args;
  return {};
}

function taskIDFromOutput(output) {
  const metadata = output?.metadata;
  for (const key of ["sessionId", "sessionID", "jobId"]) {
    if (typeof metadata?.[key] === "string") return metadata[key];
  }
  const value = typeof output?.output === "string" ? output.output : "";
  const json = (() => {
    try { return JSON.parse(value); } catch { return null; }
  })();
  if (json && typeof json.task_id === "string") return json.task_id;
  const match = /(?:task[_ ]id|<task[^>]*\bid)\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i.exec(value);
  return match?.[1];
}

function parentFromEvent(event) {
  const info = event?.properties?.info;
  return info && typeof info === "object" && typeof info.parentID === "string" ? info.parentID : null;
}

function sessionFromEvent(event) {
  if (typeof event?.properties?.sessionID === "string") return event.properties.sessionID;
  const info = event?.properties?.info;
  return info && typeof info === "object" && typeof info.id === "string" ? info.id : null;
}

function hasConcreteReviewBoundary(prompt) {
  return /```diff\b|^diff --git\b/im.test(prompt) ||
    /\b(?:changed files?|source (?:path|boundary)|search boundary|evidence boundary)\s*:\s*(?:`[^`]+`|[^\s][^\n]*\/[^\n]*|repository-wide\b)/im.test(prompt) ||
    /\bevidence bundle\s*:\s*(?:`[^`]+`|[^\s][^\n]*\/[^\n]*)/im.test(prompt);
}

function hasReaderContract(prompt) {
  return /\binvestigation\s*:\s*\S/im.test(prompt) &&
    /\b(?:search|evidence) boundary\s*:\s*(?:`[^`]+`|[^\s][^\n]*\/[^\n]*|repository-wide\b)/im.test(prompt) &&
    /\b(?:delegation value|parallel work|context compression)\s*:\s*\S/im.test(prompt);
}

function requestsMutation(prompt) {
  return /(?:^|\n)\s*(?:please\s+)?(?:apply(?:\s+(?:a|the))?\s+patch|(?:edit|write|modify|create|delete|remove|rename|move)\s+(?:a\s+|the\s+|[^\s]+)|(?:run|execute)\s+(?:a\s+|the\s+|[^\s]+)|commit\b|use\s+(?:bash|shell|terminal)\s+to\s+\S+)/im.test(prompt);
}

function responseData(response) {
  if (response && typeof response === "object" && !Array.isArray(response) && response.data !== undefined) {
    return response.data;
  }
  return response;
}

function agentFromSession(session) {
  return typeof session?.agent === "string" ? session.agent : undefined;
}

function pendingCallKey(sessionID, callID) {
  return JSON.stringify([sessionID, callID]);
}

async function createDelegationGuard(options = {}, plugin = {}) {
  const maxConcurrent = options.max_concurrent ?? 10;
  const maxTotal = options.max_total ?? 20;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isInteger(maxTotal) || maxTotal < maxConcurrent) {
    throw new Error("delegation guard requires positive integer concurrency and total limits");
  }
  const client = plugin?.client;
  const canInspectSessions = typeof client?.session?.get === "function";
  const activeByRoot = new Map();
  const childrenByRoot = new Map();
  const pendingCalls = new Map();
  const reservedByRoot = new Map();
  const reservedFreshByRoot = new Map();
  const parentByChild = new Map();
  const rootBySession = new Map();
  const agentByChild = new Map();
  const hydratedRoots = new Set();
  const deletedRoots = new Set();
  const hydratingRoots = new Map();
  const deletedDuringLineageLookup = new Set();
  let activeLineageLookups = 0;
  const outputSeenChildren = new Set();
  const terminalBeforeTaskOutput = new Set();
  const rootFor = (sessionID) => {
    const knownRoot = rootBySession.get(sessionID);
    if (knownRoot) return knownRoot;
    const seen = new Set();
    let rootID = sessionID;
    while (parentByChild.has(rootID) && !seen.has(rootID)) {
      seen.add(rootID);
      rootID = parentByChild.get(rootID);
    }
    return rootID;
  };
  const activeFor = (rootID) => activeByRoot.get(rootID) ?? new Set();
  const childrenFor = (rootID) => childrenByRoot.get(rootID) ?? new Set();
  const rememberChild = (rootID, childID, agent) => {
    const children = childrenFor(rootID);
    children.add(childID);
    childrenByRoot.set(rootID, children);
    rootBySession.set(childID, rootID);
    if (typeof agent === "string") agentByChild.set(childID, agent);
  };
  const assertLiveRoot = (rootID) => {
    if (deletedRoots.has(rootID)) throw new Error("delegation root session no longer exists");
  };
  const beginHydration = (rootID) => {
    hydratingRoots.set(rootID, (hydratingRoots.get(rootID) ?? 0) + 1);
  };
  const endHydration = (rootID) => {
    const remaining = (hydratingRoots.get(rootID) ?? 0) - 1;
    if (remaining > 0) return hydratingRoots.set(rootID, remaining);
    hydratingRoots.delete(rootID);
    deletedRoots.delete(rootID);
  };
  const markActive = (rootID, childID, agent) => {
    const active = activeFor(rootID);
    active.add(childID);
    activeByRoot.set(rootID, active);
    rememberChild(rootID, childID, agent);
  };
  const markTerminal = (childID) => {
    const rootID = rootBySession.get(childID) ?? rootFor(childID);
    if (!rootID || rootID === childID) return;
    activeFor(rootID).delete(childID);
    if (!outputSeenChildren.delete(childID)) {
      terminalBeforeTaskOutput.add(childID);
    }
  };
  const releaseReservation = (rootID, fresh) => {
    const reserved = reservedByRoot.get(rootID) ?? 0;
    if (reserved <= 1) reservedByRoot.delete(rootID);
    else reservedByRoot.set(rootID, reserved - 1);
    if (!fresh) return;
    const freshReserved = reservedFreshByRoot.get(rootID) ?? 0;
    if (freshReserved <= 1) reservedFreshByRoot.delete(rootID);
    else reservedFreshByRoot.set(rootID, freshReserved - 1);
  };
  const clearRoot = (rootID) => {
    if (activeLineageLookups > 0) deletedDuringLineageLookup.add(rootID);
    if (hydratingRoots.has(rootID)) deletedRoots.add(rootID);
    activeByRoot.delete(rootID);
    childrenByRoot.delete(rootID);
    reservedByRoot.delete(rootID);
    reservedFreshByRoot.delete(rootID);
    hydratedRoots.delete(rootID);
    for (const [callID, pending] of pendingCalls) {
      if (pending.rootID === rootID) pendingCalls.delete(callID);
    }
    for (const [sessionID, sessionRootID] of rootBySession) {
      if (sessionRootID !== rootID) continue;
      rootBySession.delete(sessionID);
      parentByChild.delete(sessionID);
      agentByChild.delete(sessionID);
      outputSeenChildren.delete(sessionID);
      terminalBeforeTaskOutput.delete(sessionID);
    }
  };
  const sessionFromResponse = (response) => {
    const session = responseData(response);
    return session && typeof session === "object" && !Array.isArray(session) && typeof session.id === "string"
      ? session
      : null;
  };
  const getSession = async (sessionID) => {
    if (!canInspectSessions) return null;
    try {
      return sessionFromResponse(await client.session.get({ path: { id: sessionID } }));
    } catch {
      return null;
    }
  };
  const resolveRoot = async (sessionID, firstSession) => {
    const knownRoot = rootBySession.get(sessionID);
    if (knownRoot) return knownRoot;
    if (!canInspectSessions) return rootFor(sessionID);
    activeLineageLookups += 1;
    try {
      let current = firstSession ?? await getSession(sessionID);
      if (!current) throw new Error("delegation cannot verify session lineage");
      const traversed = [];
      while (typeof current.parentID === "string") {
        traversed.push(current);
        current = await getSession(current.parentID);
        if (!current) throw new Error("delegation cannot verify session lineage");
      }
      if (deletedDuringLineageLookup.has(current.id)) {
        throw new Error("delegation session lineage changed");
      }
      assertLiveRoot(current.id);
      rootBySession.set(current.id, current.id);
      for (const session of traversed) {
        parentByChild.set(session.id, session.parentID);
        rootBySession.set(session.id, current.id);
        rememberChild(current.id, session.id, agentFromSession(session));
      }
      return current.id;
    } finally {
      activeLineageLookups -= 1;
      if (activeLineageLookups === 0) deletedDuringLineageLookup.clear();
    }
  };
  const hydrateRoot = async (rootID) => {
    if (hydratedRoots.has(rootID) || !canInspectSessions) return;
    beginHydration(rootID);
    try {
      assertLiveRoot(rootID);
      if (typeof client?.session?.children !== "function") {
        throw new Error("delegation cannot verify the child session quota");
      }
      const visited = new Set([rootID]);
      const visit = async (parentID) => {
        let response;
        try {
          response = responseData(await client.session.children({ path: { id: parentID } }));
        } catch {
          throw new Error("delegation cannot verify the child session quota");
        }
        assertLiveRoot(rootID);
        if (!Array.isArray(response)) throw new Error("delegation cannot verify the child session quota");
        for (const child of response) {
          if (!child || typeof child !== "object" || typeof child.id !== "string") {
            throw new Error("delegation cannot verify the child session quota");
          }
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          parentByChild.set(child.id, parentID);
          rememberChild(rootID, child.id, agentFromSession(child));
          await visit(child.id);
        }
      };
      await visit(rootID);
      assertLiveRoot(rootID);
      hydratedRoots.add(rootID);
    } finally {
      endHydration(rootID);
    }
  };
  const validateResume = async (rootID, childID, agent) => {
    if (childID === rootID) throw new Error("delegation continuation must target a child session");
    const session = await getSession(childID);
    if (canInspectSessions && !session) {
      throw new Error("delegation continuation requires an existing child session");
    }
    const childRootID = session ? await resolveRoot(childID, session) : rootBySession.get(childID);
    if (childRootID !== rootID) {
      throw new Error("delegation continuation must belong to the current root session");
    }
    const childAgent = agentByChild.get(childID) ?? agentFromSession(session);
    if (typeof childAgent === "string" && childAgent !== agent) {
      throw new Error("delegation continuation must use its original subagent type");
    }
    rememberChild(rootID, childID, childAgent);
  };
  return {
    async "tool.execute.before"(input, output) {
      if (String(input?.tool).toLowerCase() !== "task" || typeof input?.sessionID !== "string") return;
      const args = taskArguments(output.args);
      const agent = args.subagent_type;
      const prompt = args.prompt;
      if (typeof agent !== "string" || typeof prompt !== "string") throw new Error("delegation requires a subagent type and bounded prompt");
      const taskID = args.task_id;
      if (taskID !== undefined && typeof taskID !== "string") throw new Error("delegation continuation requires a valid task ID");
      const rootID = await resolveRoot(input.sessionID);
      assertLiveRoot(rootID);
      const active = activeFor(rootID);
      const reserved = reservedByRoot.get(rootID) ?? 0;
      if (active.size + reserved >= maxConcurrent) throw new Error(`delegation concurrency limit reached (${maxConcurrent})`);
      if (typeof input.callID !== "string") throw new Error("delegation requires a task call ID");
      if (pendingCalls.size >= MAX_PENDING_CALLS) throw new Error("delegation pending-call limit reached");
      const fresh = taskID === undefined;
      const callKey = pendingCallKey(input.sessionID, input.callID);
      if (pendingCalls.has(callKey)) throw new Error("delegation task call is already pending");
      pendingCalls.set(callKey, { rootID, fresh, taskID, agent });
      reservedByRoot.set(rootID, reserved + 1);
      if (fresh) {
        reservedFreshByRoot.set(rootID, (reservedFreshByRoot.get(rootID) ?? 0) + 1);
      }
      try {
        if (fresh) {
          await hydrateRoot(rootID);
          if (childrenFor(rootID).size + (reservedFreshByRoot.get(rootID) ?? 0) > maxTotal) {
            throw new Error(`delegation distinct-session limit reached (${maxTotal})`);
          }
        } else {
          await validateResume(rootID, taskID, agent);
        }
      } catch (error) {
        pendingCalls.delete(callKey);
        releaseReservation(rootID, fresh);
        throw error;
      }
    },
    async "tool.execute.after"(input, output) {
      if (String(input?.tool).toLowerCase() !== "task") return;
      const callKey = typeof input?.sessionID === "string" && typeof input?.callID === "string"
        ? pendingCallKey(input.sessionID, input.callID)
        : null;
      const pending = callKey ? pendingCalls.get(callKey) : null;
      if (callKey) pendingCalls.delete(callKey);
      const childID = taskIDFromOutput(output);
      if (!pending) return;
      releaseReservation(pending.rootID, pending.fresh);
      if (!childID) {
        return;
      }
      if (!pending.fresh && childID !== pending.taskID) {
        throw new Error("delegation continuation changed its child session");
      }
      rememberChild(pending.rootID, childID, pending.agent);
      if (!terminalBeforeTaskOutput.delete(childID)) {
        outputSeenChildren.add(childID);
        markActive(pending.rootID, childID, pending.agent);
      }
    },
    async event({ event }) {
      if (event?.type === "session.created") {
        const parentID = parentFromEvent(event);
        const childID = sessionFromEvent(event);
        if (parentID && childID) {
          const rootID = await resolveRoot(parentID).catch(() => null);
          if (!rootID) return;
          if (deletedRoots.has(rootID)) return;
          parentByChild.set(childID, parentID);
          markActive(rootID, childID);
        }
        return;
      }
      const sessionID = sessionFromEvent(event);
      const rootID = sessionID ? rootFor(sessionID) : null;
      const status = event?.properties?.status;
      if (
        event?.type === "session.deleted" ||
        event?.type === "session.idle" ||
        (event?.type === "session.status" && status?.type === "idle")
      ) {
        if (sessionID) markTerminal(sessionID);
      }
      if (event?.type === "session.deleted" && sessionID) {
        if (rootID === sessionID) clearRoot(sessionID);
      }
    },
  };
}

export const testHelpers = { createDelegationGuard };

export default {
  id: "opencode-delegation-guard",
  server: (plugin, options) => createDelegationGuard(options, plugin),
};
