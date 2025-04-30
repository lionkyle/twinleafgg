import { Action } from '../store/actions/action';
import { Arbiter } from './arbiter';
import { Client } from '../client/client.interface';
import { Core } from './core';
import { GameSettings } from './game-settings';
import { MatchRecorder } from './match-recorder';
import { PlayerStats } from './player-stats';
import { ResolvePromptAction } from '../store/actions/resolve-prompt-action';
import { State, GamePhase } from '../store/state/state';
import { Store } from '../store/store';
import { StoreHandler } from '../store/store-handler';
import { AbortGameAction, AbortGameReason } from '../store/actions/abort-game-action';
import { Format } from '../store/card/card-types';

export class Game implements StoreHandler {

  private readonly maxInvalidMoves: number = 100;

  public id: number;
  public clients: Client[] = [];
  public playerStats: PlayerStats[] = [];
  private arbiter = new Arbiter();
  private store: Store;
  private matchRecorder: MatchRecorder;
  private timeoutRef: NodeJS.Timeout | undefined;
  private lastActivity: number = Date.now();
  public format: Format = Format.STANDARD;

  constructor(private core: Core, id: number, public gameSettings: GameSettings) {
    this.id = id;
    this.store = new Store(this);
    this.store.state.rules = gameSettings.rules;
    this.matchRecorder = new MatchRecorder(core);
    this.format = gameSettings.format;
  }

  public get state(): State {
    return this.store.state;
  }

  public updateLastActivity(): void {
    this.lastActivity = Date.now();
  }

  public getLastActivity(): number {
    return this.lastActivity;
  }

  public isInactive(timeoutMs: number = 5 * 60 * 1000): boolean {
    return Date.now() - this.lastActivity > timeoutMs;
  }

  public cleanup(): void {
    this.stopTimer();
    if (this.matchRecorder) {
      this.matchRecorder.cleanup();
    }
    this.store.cleanup();
    this.arbiter.cleanup();
  }

  public onStateChange(state: State): void {
    this.updateLastActivity();
    if (this.handleArbiterPrompts(state)) {
      return;
    }

    if (this.gameSettings.recordingEnabled) {
      this.matchRecorder.onStateChange(state);
    }

    this.updateIsTimeRunning(state);

    // Only emit state changes if game is not paused
    if (!state.isPaused) {
      this.core.emit(c => c.onStateChange(this, state));
    }

    if (state.phase !== GamePhase.FINISHED && this.timeoutRef === undefined) {
      this.startTimer();
    }

    if (state.phase === GamePhase.FINISHED) {
      this.stopTimer();
      this.core.deleteGame(this);
    }
  }

  private handleArbiterPrompts(state: State): boolean {
    let resolved: { id: number, action: ResolvePromptAction } | undefined;
    const unresolved = state.prompts.filter(item => item.result === undefined);

    for (let i = 0; i < unresolved.length; i++) {
      const action = this.arbiter.resolvePrompt(state, unresolved[i]);
      if (action !== undefined) {
        resolved = { id: unresolved[i].id, action };
        break;
      }
    }

    if (resolved === undefined) {
      return false;
    }

    this.store.dispatch(resolved.action);
    return true;
  }

  public dispatch(client: Client, action: Action): State {
    let state = this.store.state;
    try {
      state = this.store.dispatch(action);
      state = this.updateInvalidMoves(state, client.id, false);

    } catch (error) {
      state = this.updateInvalidMoves(state, client.id, true);
      throw error;
    }

    return state;
  }

  public handleClientLeave(client: Client): void {
    const state = this.store.state;
    if (state.phase === GamePhase.FINISHED) {
      return;
    }

    const player = state.players.find(p => p.id === client.id);
    if (player !== undefined) {
      // Instead of immediately aborting, pause the game
      if (!state.isPaused) {
        state.isPaused = true;
        state.pausedBy = player.id;
        state.pauseStartTime = Date.now();
        console.log(`[Game] Game ${this.id} paused due to player ${player.name} disconnection`);

        // Notify other players
        this.core.emit(c => {
          if (c !== client) {
            c.onStateChange(this, state);
          }
        });
      }
    }
  }

  public handleClientReconnect(client: Client): void {
    const state = this.store.state;
    if (state.phase === GamePhase.FINISHED) {
      return;
    }

    const player = state.players.find(p => p.id === client.id);
    if (player !== undefined && state.isPaused && state.pausedBy === player.id) {
      // Resume the game
      state.isPaused = false;
      state.pausedBy = null;
      state.pauseStartTime = null;
      console.log(`[Game] Game ${this.id} resumed after player ${player.name} reconnection`);

      // Notify all players
      this.core.emit(c => c.onStateChange(this, state));
    }
  }

  private updateInvalidMoves(state: State, playerId: number, isInvalidMove: boolean): State {
    if (state.phase === GamePhase.FINISHED) {
      return state;
    }

    // Action dispatched not by the player
    const isPlayer = state.players.some(p => p.id === playerId);
    if (isPlayer === false) {
      return state;
    }

    const stats = this.playerStats.find(p => p.clientId === playerId);
    if (stats === undefined) {
      return state;
    }
    stats.invalidMoves = isInvalidMove ? stats.invalidMoves + 1 : 0;

    if (stats.invalidMoves > this.maxInvalidMoves) {
      const action = new AbortGameAction(playerId, AbortGameReason.ILLEGAL_MOVES);
      state = this.store.dispatch(action);
    }

    return state;
  }

  private updateIsTimeRunning(state: State) {
    state.players.forEach(player => {
      const stats = this.playerStats.find(p => p.clientId === player.id);
      if (stats === undefined) {
        this.playerStats.push({
          clientId: player.id,
          isTimeRunning: false,
          invalidMoves: 0,
          timeLeft: this.gameSettings.timeLimit
        });
      }
    });

    const activePlayers = this.getTimeRunningPlayers(state);
    this.playerStats.forEach(p => {
      p.isTimeRunning = activePlayers.includes(p.clientId);
    });
  }

  /**
   * Returns playerIds that needs to make a move.
   * Used to calculate their time left.
   */
  private getTimeRunningPlayers(state: State): number[] {
    if (state.phase === GamePhase.WAITING_FOR_PLAYERS) {
      return [];
    }

    const result: number[] = [];
    state.prompts.filter(p => p.result === undefined).forEach(p => {
      if (!result.includes(p.playerId)) {
        result.push(p.playerId);
      }
    });

    if (result.length > 0) {
      return result;
    }

    const player = state.players[state.activePlayer];
    if (player !== undefined) {
      result.push(player.id);
    }

    return result;
  }

  private startTimer() {
    const intervalDelay = 1000; // 1 second

    // Game time is set to unlimited
    if (this.gameSettings.timeLimit === 0) {
      return;
    }

    this.timeoutRef = setInterval(() => {
      for (const stats of this.playerStats) {
        if (stats.isTimeRunning) {
          stats.timeLeft -= 1;
          if (stats.timeLeft <= 0) {
            const action = new AbortGameAction(stats.clientId, AbortGameReason.TIME_ELAPSED);
            this.store.dispatch(action);
            return;
          }
        }
      }
    }, intervalDelay);
  }

  private stopTimer() {
    if (this.timeoutRef !== undefined) {
      clearInterval(this.timeoutRef);
      this.timeoutRef = undefined;
    }
  }

}
