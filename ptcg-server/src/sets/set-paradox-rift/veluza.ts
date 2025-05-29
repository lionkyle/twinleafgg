import { AttachEnergyPrompt, GameMessage, PlayerType, PokemonCardList, PowerType, SlotType, State, StateUtils, StoreLike } from '../../game';
import { CardType, Stage, SuperType } from '../../game/store/card/card-types';
import { PokemonCard } from '../../game/store/card/pokemon-card';
import { CheckProvidedEnergyEffect } from '../../game/store/effects/check-effects';
import { Effect } from '../../game/store/effects/effect';
import { AttackEffect, KnockOutEffect } from '../../game/store/effects/game-effects';
import { IS_ABILITY_BLOCKED, MOVE_CARDS } from '../../game/store/prefabs/prefabs';

export class Veluza extends PokemonCard {

  public stage: Stage = Stage.BASIC;

  public cardType: CardType = CardType.WATER;

  public hp: number = 120;

  public weakness = [{ type: CardType.LIGHTNING }];

  public retreat = [CardType.COLORLESS, CardType.COLORLESS];

  public powers = [{
    name: 'Filet Memento',
    powerType: PowerType.ABILITY,
    text: 'If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent\'s Pokémon, move up to 2 [W] Energy cards from this Pokémon to 1 of your Benched Pokémon.'
  }];

  public attacks = [
    {
      name: 'Hydro Pump',
      cost: [CardType.COLORLESS, CardType.COLORLESS, CardType.COLORLESS],
      damage: 60,
      damageCalculation: '+',
      text: 'This attack does 20 more damage times the amount of [W] Energy attached to this Pokémon.'
    }
  ];

  public set: string = 'PAR';

  public cardImage: string = 'assets/cardback.png';

  public setNumber: string = '54';

  public name: string = 'Veluza';

  public fullName: string = 'Veluza PAR';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {

    if (effect instanceof KnockOutEffect && effect.target.cards.includes(this) &&
      effect.player.marker.hasMarker(effect.player.DAMAGE_DEALT_MARKER)) {
      const player = effect.player;

      if (IS_ABILITY_BLOCKED(store, state, player, this)) {
        return state;
      }

      // Make a copy of the active's cards before they are discarded (like Exp. Share)
      const activeCopy = new PokemonCardList();
      activeCopy.cards = effect.target.cards.slice();

      return store.prompt(state, new AttachEnergyPrompt(
        player.id,
        GameMessage.ATTACH_ENERGY_TO_BENCH,
        activeCopy,
        PlayerType.BOTTOM_PLAYER,
        [SlotType.BENCH],
        { superType: SuperType.ENERGY },
        { allowCancel: false, min: 0, max: 2, validCardTypes: [CardType.WATER, CardType.ANY, CardType.WLFM, CardType.GRW] }
      ), transfers => {
        transfers = transfers || [];
        for (const transfer of transfers) {
          const target = StateUtils.getTarget(state, player, transfer.to);
          // Move the card from the discard pile to the target (to avoid duplication)
          state = MOVE_CARDS(store, state, player.discard, target, { cards: [transfer.card] });
        }
      });
    }

    if (effect instanceof AttackEffect && effect.attack === this.attacks[0]) {
      const player = effect.player;

      const checkProvidedEnergyEffect = new CheckProvidedEnergyEffect(player);
      store.reduceEffect(state, checkProvidedEnergyEffect);

      let energyCount = 0;
      checkProvidedEnergyEffect.energyMap.forEach(em => {
        energyCount += em.provides.filter(cardType =>
          cardType === CardType.WATER || cardType === CardType.ANY || cardType == CardType.WLFM || cardType == CardType.GRW
        ).length;
      });
      effect.damage += energyCount * 20;
    }
    return state;
  }
}
