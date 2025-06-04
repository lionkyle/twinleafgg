import { ConfirmPrompt, GameMessage, PowerType, ShuffleDeckPrompt, State, StateUtils, StoreLike } from '../../game';
import { CardTag, CardType, Stage } from '../../game/store/card/card-types';
import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Effect } from '../../game/store/effects/effect';
import { PlayPokemonEffect } from '../../game/store/effects/play-card-effects';
import { IS_POKEMON_POWER_BLOCKED } from '../../game/store/prefabs/prefabs';

export class UnwonE extends PokemonCard {

  public stage: Stage = Stage.BASIC;
  public tags = [CardTag.UNOWN];
  public cardType: CardType = P;
  public hp: number = 40;
  public weakness = [{ type: P }];
  public retreat = [C];

  public powers = [{
    name: 'Engage',
    powerType: PowerType.POKEMON_POWER,
    text: 'When you play Unown E from your hand, your opponent may shuffle his or her hand into his or her deck and then draw 4 cards. Either way, you may shuffle your hand into your deck and draw 4 cards.'
  }];

  public attacks = [{
    name: 'Hidden Power',
    cost: [P],
    damage: 10,
    text: ''
  }];

  public set: string = 'N2';
  public cardImage: string = 'assets/cardback.png';
  public setNumber: string = '67';
  public name: string = 'Unown [E]';
  public fullName: string = 'Unown [E] N2';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {

    if (effect instanceof PlayPokemonEffect && effect.pokemonCard === this && !IS_POKEMON_POWER_BLOCKED(store, state, effect.player, this)) {
      const player = effect.player;
      const opponent = StateUtils.getOpponent(state, player);

      // Opponent chooses first
      state = store.prompt(state, new ConfirmPrompt(
        opponent.id,
        GameMessage.WANT_TO_USE_ABILITY
      ), opponentWantsToShuffle => {
        if (opponentWantsToShuffle) {
          opponent.hand.moveTo(opponent.deck);
          state = store.prompt(state, new ShuffleDeckPrompt(opponent.id), deckOrder => {
            opponent.deck.applyOrder(deckOrder);
            opponent.deck.moveTo(opponent.hand, 4);
          });
        }

        // Then player chooses
        state = store.prompt(state, new ConfirmPrompt(
          player.id,
          GameMessage.WANT_TO_USE_ABILITY
        ), playerWantsToShuffle => {
          if (playerWantsToShuffle) {
            const cards = player.hand.cards.filter(c => c !== this);
            player.hand.moveCardsTo(cards, player.deck);
            state = store.prompt(state, new ShuffleDeckPrompt(player.id), deckOrder => {
              player.deck.applyOrder(deckOrder);
              player.deck.moveTo(player.hand, 4);
            });
          }
        });
      });
    }

    return state;
  }
}