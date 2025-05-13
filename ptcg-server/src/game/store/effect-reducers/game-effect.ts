import { GameError } from '../../game-error';
import { GameLog, GameMessage } from '../../game-message';
import { BoardEffect, CardTag, CardType, SpecialCondition, Stage, SuperType } from '../card/card-types';
import { Resistance, Weakness } from '../card/pokemon-types';
import { ApplyWeaknessEffect, DealDamageEffect } from '../effects/attack-effects';
import {
  AddSpecialConditionsPowerEffect,
  CheckAttackCostEffect,
  CheckPokemonStatsEffect,
  CheckPokemonTypeEffect,
  CheckProvidedEnergyEffect
} from '../effects/check-effects';
import { Effect } from '../effects/effect';
import {
  AttackEffect,
  EvolveEffect,
  HealEffect, KnockOutEffect,
  PowerEffect,
  TrainerPowerEffect,
  UseAttackEffect,
  UsePowerEffect,
  UseStadiumEffect,
  UseTrainerPowerEffect
} from '../effects/game-effects';
import { AfterAttackEffect, EndTurnEffect } from '../effects/game-phase-effects';
import { CoinFlipPrompt } from '../prompts/coin-flip-prompt';
import { StateUtils } from '../state-utils';
import { GamePhase, State } from '../state/state';
import { StoreLike } from '../store-like';
import { MoveCardsEffect } from '../effects/game-effects';
import { PokemonCardList } from '../state/pokemon-card-list';
import { MOVE_CARDS } from '../prefabs/prefabs';
import { CardList } from '../state/card-list';


function applyWeaknessAndResistance(
  damage: number,
  cardTypes: CardType[],
  additionalCardTypes: CardType[],
  weakness: Weakness[],
  resistance: Resistance[]
): number {
  let multiply = 1;
  let modifier = 0;

  const allTypes = [...cardTypes, ...additionalCardTypes];

  for (const item of weakness) {
    if (allTypes.includes(item.type)) {
      if (item.value === undefined) {
        multiply *= 2;
      } else {
        modifier += item.value;
      }
    }
  }

  for (const item of resistance) {
    if (allTypes.includes(item.type)) {
      modifier += item.value;
    }
  }

  return (damage * multiply) + modifier;
}

function* useAttack(next: Function, store: StoreLike, state: State, effect: UseAttackEffect | AttackEffect): IterableIterator<State> {
  const player = effect.player;
  const opponent = StateUtils.getOpponent(state, player);

  console.log('[useAttack] Starting attack sequence');

  //Skip attack on first turn
  if (state.turn === 1 && effect.attack.canUseOnFirstTurn !== true && state.rules.attackFirstTurn == false) {
    throw new GameError(GameMessage.CANNOT_ATTACK_ON_FIRST_TURN);
  }

  const sp = player.active.specialConditions;
  if (sp.includes(SpecialCondition.PARALYZED) || sp.includes(SpecialCondition.ASLEEP)) {
    throw new GameError(GameMessage.BLOCKED_BY_SPECIAL_CONDITION);
  }

  const attack = effect.attack;
  let attackingPokemon = player.active;

  // Check for attacks that can be used from bench
  player.bench.forEach(benchSlot => {
    const benchPokemon = benchSlot.getPokemonCard();
    if (benchPokemon && benchPokemon.attacks.some(a => a.name === attack.name && a.useOnBench)) {
      attackingPokemon = benchSlot;
    }
  });

  const checkAttackCost = new CheckAttackCostEffect(player, attack);
  state = store.reduceEffect(state, checkAttackCost);

  const checkProvidedEnergy = new CheckProvidedEnergyEffect(player, attackingPokemon);
  state = store.reduceEffect(state, checkProvidedEnergy);

  if (StateUtils.checkEnoughEnergy(checkProvidedEnergy.energyMap, checkAttackCost.cost as CardType[]) === false) {
    throw new GameError(GameMessage.NOT_ENOUGH_ENERGY);
  }

  if (sp.includes(SpecialCondition.CONFUSED)) {
    let flip = false;

    store.log(state, GameLog.LOG_FLIP_CONFUSION, { name: player.name });
    yield store.prompt(state, new CoinFlipPrompt(
      player.id,
      GameMessage.FLIP_CONFUSION),
      result => {
        flip = result;
        next();
      });

    if (flip === false) {
      store.log(state, GameLog.LOG_HURTS_ITSELF);
      player.active.damage += 30;
      state = store.reduceEffect(state, new EndTurnEffect(player));
      return state;
    }
  }

  console.log('[useAttack] Executing first attack:', attack.name);
  store.log(state, GameLog.LOG_PLAYER_USES_ATTACK, { name: player.name, attack: attack.name });
  state.phase = GamePhase.ATTACK;

  const attackEffect = (effect instanceof AttackEffect) ? effect : new AttackEffect(player, opponent, attack);
  state = store.reduceEffect(state, attackEffect);

  if (store.hasPrompts()) {
    yield store.waitPrompt(state, () => next());
  }

  if (attackEffect.damage > 0) {
    console.log('[useAttack] Applying damage:', attackEffect.damage);
    const dealDamage = new DealDamageEffect(attackEffect, attackEffect.damage);
    state = store.reduceEffect(state, dealDamage);
  }

  const afterAttackEffect = new AfterAttackEffect(effect.player);
  state = store.reduceEffect(state, afterAttackEffect);

  if (store.hasPrompts()) {
    yield store.waitPrompt(state, () => next());
  }
  return store.reduceEffect(state, new EndTurnEffect(player));
}

export function gameReducer(store: StoreLike, state: State, effect: Effect): State {

  if (effect instanceof KnockOutEffect) {
    const card = effect.target.getPokemonCard();
    if (card !== undefined) {

      // Pokemon ex rule
      if (card.tags.includes(CardTag.POKEMON_EX) || card.tags.includes(CardTag.POKEMON_V) || card.tags.includes(CardTag.POKEMON_VSTAR) || card.tags.includes(CardTag.POKEMON_ex) || card.tags.includes(CardTag.POKEMON_GX)) {
        effect.prizeCount += 1;
      }
      if (card.tags.includes(CardTag.POKEMON_SV_MEGA) || card.tags.includes(CardTag.TAG_TEAM) || card.tags.includes(CardTag.DUAL_LEGEND)) {
        effect.prizeCount += 1;
      }

      if (card.tags.includes(CardTag.POKEMON_VMAX) || card.tags.includes(CardTag.POKEMON_VUNION)) {
        effect.prizeCount += 2;
      }

      store.log(state, GameLog.LOG_POKEMON_KO, { name: card.name });

      // Handle Lost City marker or PRISM_STAR cards
      if (effect.target.marker.hasMarker('LOST_CITY_MARKER') || card.tags.includes(CardTag.PRISM_STAR)) {
        const lostZoned = new CardList();
        const attachedCards = new CardList();
        const pokemonIndices = effect.target.cards.map((card, index) => index);

        // Clear damage and effects first
        effect.target.damage = 0;
        effect.target.clearEffects();

        for (let i = pokemonIndices.length - 1; i >= 0; i--) {
          const removedCard = effect.target.cards.splice(pokemonIndices[i], 1)[0];

          // Handle cardlist cards (energy, tools, etc.)
          if (removedCard.cards) {
            const cards = removedCard.cards;
            while (cards.cards.length > 0) {
              const card = cards.cards[0];
              attachedCards.cards.push(card);
              cards.cards.splice(0, 1);
            }
          }

          // Handle the main card
          if (removedCard.superType === SuperType.POKEMON || (<any>removedCard).stage === Stage.BASIC || removedCard.tags.includes(CardTag.PRISM_STAR)) {
            lostZoned.cards.push(removedCard);
          } else {
            attachedCards.cards.push(removedCard);
          }
        }

        // Move attached cards to discard
        if (attachedCards.cards.length > 0) {
          state = MOVE_CARDS(store, state, attachedCards, effect.player.discard);
        }

        // Move Pokémon to lost zone
        if (lostZoned.cards.length > 0) {
          state = MOVE_CARDS(store, state, lostZoned, effect.player.lostzone);
        }
      } else {
        // Default behavior - move to discard
        effect.target.clearEffects();
        state = MOVE_CARDS(store, state, effect.target, effect.player.discard);
      }
    }
  }

  if (effect instanceof ApplyWeaknessEffect) {
    const checkPokemonType = new CheckPokemonTypeEffect(effect.source);
    state = store.reduceEffect(state, checkPokemonType);
    const checkPokemonStats = new CheckPokemonStatsEffect(effect.target);
    state = store.reduceEffect(state, checkPokemonStats);

    const cardType = checkPokemonType.cardTypes;
    const additionalCardTypes = checkPokemonType.cardTypes;
    const weakness = effect.ignoreWeakness ? [] : checkPokemonStats.weakness;
    const resistance = effect.ignoreResistance ? [] : checkPokemonStats.resistance;
    effect.damage = applyWeaknessAndResistance(effect.damage, cardType, additionalCardTypes, weakness, resistance);
    return state;
  }

  if (effect instanceof UseAttackEffect) {
    const generator = useAttack(() => generator.next(), store, state, effect);
    return generator.next().value;
  }

  if (effect instanceof UsePowerEffect) {
    const player = effect.player;
    const power = effect.power;
    const card = effect.card;

    store.log(state, GameLog.LOG_PLAYER_USES_ABILITY, { name: player.name, ability: power.name });
    state = store.reduceEffect(state, new PowerEffect(player, power, card));
    return state;
  }

  if (effect instanceof UseTrainerPowerEffect) {
    const player = effect.player;
    const power = effect.power;
    const card = effect.card;

    store.log(state, GameLog.LOG_PLAYER_USES_ABILITY, { name: player.name, ability: power.name });
    state = store.reduceEffect(state, new TrainerPowerEffect(player, power, card));
    return state;
  }

  if (effect instanceof AddSpecialConditionsPowerEffect) {
    const target = effect.target;
    effect.specialConditions.forEach(sp => {
      target.addSpecialCondition(sp);
    });
    if (effect.poisonDamage !== undefined) {
      target.poisonDamage = effect.poisonDamage;
    }
    if (effect.burnDamage !== undefined) {
      target.burnDamage = effect.burnDamage;
    }
    if (effect.sleepFlips !== undefined) {
      target.sleepFlips = effect.sleepFlips;
    }
    return state;
  }

  if (effect instanceof UseStadiumEffect) {
    const player = effect.player;
    store.log(state, GameLog.LOG_PLAYER_USES_STADIUM, { name: player.name, stadium: effect.stadium.name });
    player.stadiumUsedTurn = state.turn;
  }

  // if (effect instanceof TrainerEffect && effect.trainerCard.trainerType === TrainerType.SUPPORTER) {
  //   const player = effect.player;
  //   store.log(state, GameLog.LOG_PLAYER_PLAYS_SUPPORTER, { name: player.name, stadium: effect.trainerCard.name });
  // }

  if (effect instanceof HealEffect) {
    effect.target.damage = Math.max(0, effect.target.damage - effect.damage);
    return state;
  }

  if (effect instanceof EvolveEffect) {
    const pokemonCard = effect.target.getPokemonCard();

    if (pokemonCard === undefined) {
      throw new GameError(GameMessage.INVALID_TARGET);
    }
    store.log(state, GameLog.LOG_PLAYER_EVOLVES_POKEMON, {
      name: effect.player.name,
      pokemon: pokemonCard.name,
      card: effect.pokemonCard.name
    });
    effect.player.hand.moveCardTo(effect.pokemonCard, effect.target);
    effect.target.pokemonPlayedTurn = state.turn;
    // effect.target.clearEffects();
    // Apply the removePokemonEffects method from the Player class
    // effect.player.removePokemonEffects(effect.target);
    effect.target.specialConditions = [];
    effect.target.marker.markers = [];
  }

  if (effect instanceof MoveCardsEffect) {
    const source = effect.source;
    const destination = effect.destination;

    // If source is a PokemonCardList, always clean up when moving cards
    if (source instanceof PokemonCardList) {
      source.clearEffects();
      source.damage = 0;
      source.specialConditions = [];
      source.marker.markers = [];
      source.tool = undefined;
      source.removeBoardEffect(BoardEffect.ABILITY_USED);
    }

    // If specific cards are specified
    if (effect.cards) {
      if (source instanceof PokemonCardList) {
        source.moveCardsTo(effect.cards, destination);
        // Log the card movement
        // effect.cards.forEach(card => {
        //   store.log(state, GameLog.LOG_CARD_MOVED, { name: card.name, action: 'put', destination: 'destination' });
        // });
        if (effect.toBottom) {
          destination.cards = [...destination.cards.slice(effect.cards.length), ...effect.cards];
        } else if (effect.toTop) {
          destination.cards = [...effect.cards, ...destination.cards];
        }
      } else {
        source.moveCardsTo(effect.cards, destination);
        // Log the card movement
        // effect.cards.forEach(card => {
        //   store.log(state, GameLog.LOG_CARD_MOVED, { name: card.name, action: 'put', destination: 'destination' });
        // });
        if (effect.toBottom) {
          destination.cards = [...destination.cards.slice(effect.cards.length), ...effect.cards];
        } else if (effect.toTop) {
          destination.cards = [...effect.cards, ...destination.cards];
        }
      }
    }
    // If count is specified
    else if (effect.count !== undefined) {
      const cards = source.cards.slice(0, effect.count);
      source.moveCardsTo(cards, destination);
      // Log the card movement
      // cards.forEach(card => {
      //   store.log(state, GameLog.LOG_CARD_MOVED, { name: card.name, action: 'put', destination: 'destination' });
      // });
      if (effect.toBottom) {
        destination.cards = [...destination.cards.slice(cards.length), ...cards];
      } else if (effect.toTop) {
        destination.cards = [...cards, ...destination.cards];
      }
    }
    // Move all cards
    else {
      if (effect.toTop) {
        source.moveToTopOfDestination(destination);
      } else {
        source.moveTo(destination);
      }
    }

    // If source is a PokemonCardList and we moved all cards, discard remaining attached cards
    if (source instanceof PokemonCardList && source.getPokemons().length === 0) {
      const player = StateUtils.findOwner(state, source);
      source.moveTo(player.discard);
    }

    return state;
  }

  return state;
}

