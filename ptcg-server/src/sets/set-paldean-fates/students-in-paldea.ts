import { Effect } from '../../game/store/effects/effect';
import { TrainerCard } from '../../game/store/card/trainer-card';
import { CardTag, SuperType, TrainerType } from '../../game/store/card/card-types';
import { StoreLike } from '../../game/store/store-like';
import { State } from '../../game/store/state/state';
import { TrainerEffect } from '../../game/store/effects/play-card-effects';
import { Card, ChooseCardsPrompt, GameError, GameMessage, PokemonCard, ShowCardsPrompt, ShuffleDeckPrompt, StateUtils } from '../../game';

export class StudentsInPaldea extends TrainerCard {

  public trainerType: TrainerType = TrainerType.SUPPORTER;

  public regulationMark = 'G';

  public cardImage: string = 'assets/cardback.png';

  public setNumber: string = '85';

  public set = 'PAF';

  public name = 'Paldean Student';

  public fullName = 'Paldean Student PAF';

  public text: string =
    'Search your deck for a Pokémon that doesn\'t have a Rule Box, reveal it, and put it into your hand. For each other Students in Paldea in your discard pile, you may search your deck for another Pokémon that doesn\'t have a Rule Box. Then, shuffle your deck. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {
    if (effect instanceof TrainerEffect && effect.trainerCard === this) {
      const player = effect.player;
      const opponent = StateUtils.getOpponent(state, player);

      const supporterTurn = player.supporterTurn;

      if (supporterTurn > 0) {
        throw new GameError(GameMessage.SUPPORTER_ALREADY_PLAYED);
      }

      player.hand.moveCardTo(effect.trainerCard, player.supporter);
      // We will discard this card after prompt confirmation
      effect.preventDefault = true;

      const cardsInDiscard = effect.player.discard.cards.filter(c => c.name === 'Paldean Student');
      const cardsToTake = 1 + cardsInDiscard.length;

      const blocked: number[] = [];
      player.deck.cards.forEach((card, index) => {
        if ((card instanceof PokemonCard &&
          (card.tags.includes(CardTag.POKEMON_V) ||
            card.tags.includes(CardTag.POKEMON_VSTAR) ||
            card.tags.includes(CardTag.POKEMON_VMAX) ||
            card.tags.includes(CardTag.POKEMON_ex) ||
            card.tags.includes(CardTag.RADIANT)))) {
          blocked.push(index);
        }
      });


      let cards: Card[] = [];
      state = store.prompt(state, new ChooseCardsPrompt(
        player,
        GameMessage.CHOOSE_CARD_TO_HAND,
        player.deck,
        { superType: SuperType.POKEMON },
        { min: 0, max: cardsToTake, allowCancel: false, blocked }
      ), selected => {
        cards = selected || [];

        player.deck.moveCardsTo(cards, player.hand);

        state = store.prompt(state, new ShowCardsPrompt(
          opponent.id,
          GameMessage.CARDS_SHOWED_BY_THE_OPPONENT,
          cards
        ), () => {
          player.supporter.moveCardTo(effect.trainerCard, player.discard);
        });
        return store.prompt(state, new ShuffleDeckPrompt(player.id), order => {
          player.deck.applyOrder(order);
        });
      });
    }
    return state;
  }
}