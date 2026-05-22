class PresentationChannel < ApplicationCable::Channel
  ACTIVE_SESSION_CACHE_VERSION = 'v1'.freeze
  QUESTIONS_LOOKUP_CACHE_VERSION = 'v1'.freeze
  ACTIVE_INTERACTION_CACHE_VERSION = 'v2'.freeze
  LIVE_STATE_CACHE_VERSION = 'v1'.freeze
  ACTIVE_SESSION_CACHE_TTL = 30.seconds
  QUESTIONS_LOOKUP_CACHE_TTL = 10.minutes
  ACTIVE_INTERACTION_CACHE_TTL = 12.hours
  LIVE_STATE_CACHE_TTL = 12.hours

  def self.active_session_cache_key(presentation_id)
    "active_session_id:#{ACTIVE_SESSION_CACHE_VERSION}:#{presentation_id}"
  end

  def self.questions_lookup_cache_key(presentation_id)
    "presentation_questions_map:#{QUESTIONS_LOOKUP_CACHE_VERSION}:#{presentation_id}"
  end

  def self.active_interaction_cache_key(presentation_id, session_id)
    "active_interaction:#{ACTIVE_INTERACTION_CACHE_VERSION}:#{presentation_id}:#{session_id}"
  end

  # Cache-nøkkel for siste kjente lysbilde + liveboard pr. økt. Brukes ved reconnect så
  # publikum kan synke tilbake til riktig state uten å vente på neste presenter-handling.
  def self.live_state_cache_key(presentation_id, session_id)
    "live_state:#{LIVE_STATE_CACHE_VERSION}:#{presentation_id}:#{session_id}"
  end

  def self.invalidate_active_session_cache(presentation_id)
    Rails.cache.delete(active_session_cache_key(presentation_id))
  end

  def self.invalidate_questions_lookup_cache(presentation_id)
    Rails.cache.delete(questions_lookup_cache_key(presentation_id))
  end

  # WS-kanal for sanntidsinteraksjoner i presentasjonsøkter, inkludert deltakelse, lysbildeendringer, spørsmål og avstemninger.
  def subscribed
    presentation = Presentation.find_by(id: params[:presentation_id])
    return reject unless presentation

    stream_for presentation

    active_session = active_session_for_presentation(presentation)
    return unless active_session && presentation.is_live

    if current_user.id != presentation.owner_id
      SessionParticipant.find_or_create_by(
        session_id: active_session.id,
        user_id: current_user.id
      )
      participant_count = active_session.session_participants.count

      PresentationChannel.broadcast_to(
        presentation,
        { type: 'participant_joined', count: participant_count }
      )
    else
      participant_count = active_session.session_participants.count
    end

    transmit(
      {
        type: 'session_state',
        participant_count: participant_count,
        session_started: active_session.started?,
        session_ended: active_session.ended_at.present?
      }
    )

    # Resync: send hele live-staten kun til den nye klienten, så reconnects ikke
    # ender opp med utdatert eller halv state. Dette er kuren mot "audience ser
    # gammel slide / poll viser ikke selv om presentatør har aktivert".
    transmit_live_state_snapshot(presentation, active_session)
  end

  def unsubscribed
  end

  # Presentatør starter en presentasjonsøkt, som gjør at deltakere kan bli med og interagere i sanntid.
  def start_session(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    active_session = active_session_for_presentation(presentation)
    return unless active_session

    active_session.update!(started: true)
    clear_active_interaction_for_session(presentation, active_session)
    clear_live_state_for_session(presentation, active_session)
    participant_count = active_session.session_participants.count

    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'session_started',
        session_started: true,
        participant_count: participant_count
      }
    )
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'session_state',
        participant_count: participant_count,
        session_started: true,
        session_ended: false
      }
    )
  end

  # Synkroniser YouTube/Vimeo-avspilling fra presentatør til publikum (posisjon + play/pause).
  # `sent_at_ms` (presenter wall-clock i ms) sendes uendret videre så publikum kan
  # ekstrapolere presentatørens nåværende avspillingsposisjon og kompensere for
  # nettverkslatens i stedet for å seeke til en utdatert posisjon.
  def sync_embed_playback(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    slide_index = Integer(data['slide_index'] || data[:slide_index] || 0)
    embed_key = (data['embed_key'] || data[:embed_key]).to_s
    return if embed_key.blank?

    state = (data['state'] || data[:state]).to_s
    return unless %w[play pause].include?(state)

    raw_sent_at = data['sent_at_ms'] || data[:sent_at_ms]
    sent_at_ms = raw_sent_at.nil? ? nil : raw_sent_at.to_f

    payload = {
      type: 'embed_playback',
      slide_index: slide_index,
      embed_key: embed_key,
      state: state,
      time: (data['time'] || data[:time]).to_f,
      seq: Integer(data['seq'] || data[:seq] || 0)
    }
    payload[:sent_at_ms] = sent_at_ms if sent_at_ms

    PresentationChannel.broadcast_to(presentation, payload)
  end

  # Presentatør navigerer til et spesifikt lysbilde, og nullstiller aktive polls for å sikre korrekt visning.
  def navigate_slide(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    raw = data['slide_index']
    raw = data[:slide_index] if raw.nil?
    slide_index = Integer(raw)
    return if slide_index.negative?

    # Slik at gjenåpning av lysbilde ikke beholder gammel aktiv poll i DB.
    # Vi nullstiller polls på tvers av hele presentasjonen — ikke bare gjeldende slide —
    # for å unngå at stale `is_active=true` blir liggende på en annen slide etter slidebytte.
    deactivate_all_polls(presentation)
    active_session = active_session_for_presentation(presentation)
    clear_active_interaction_for_session(presentation, active_session) if active_session

    resume_raw = data['resume_liveboard']
    resume_raw = data[:resume_liveboard] if resume_raw.nil?
    resume_liveboard = resume_raw == true || resume_raw.to_s == 'true'

    if active_session
      update_live_state_for_session(presentation, active_session) do |state|
        state['current_slide'] = slide_index
        # Slide-bytte resetter liveboard med mindre presentatør eksplisitt vil gjenoppta det.
        state['liveboard_slide_index'] = resume_liveboard ? slide_index : nil
      end
    end

    payload = { type: 'slide_change', slide_index: slide_index }
    payload[:resume_liveboard] = true if resume_liveboard

    PresentationChannel.broadcast_to(presentation, payload)
  end

  # Før neste lysbilde: nullstiller aktive interaksjoner for alle klienter (publikum ser sliden tydelig).
  def clear_live_interactions(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    deactivate_all_polls(presentation)
    active_session = active_session_for_presentation(presentation)
    clear_active_interaction_for_session(presentation, active_session) if active_session

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'interactions_cleared' }
    )
  end

  # Låser nåværende interaksjon slik at publikum fortsatt ser den, men ikke kan sende nye svar.
  #
  # Idempotent og ufeilbarlig: broadcaster ALLTID `interactions_stopped` til publikum, selv om
  # cachen er tom eller den aktive interaksjonen ikke kan slås opp (f.eks. fordi en annen
  # Puma-arbeider håndterte aktiveringen og vår lokale cache er fersk). Tidligere ble denne
  # tidlig-returnert hvis cache-staten manglet, og det er den direkte årsaken til at "Stopp"-
  # knappen ikke fungerte på deploy.
  def stop_interactions(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    active_session = active_session_for_presentation(presentation)

    interaction_type = nil
    interaction_id = nil

    if active_session
      interaction = active_interaction_for_session(presentation, active_session)
      if interaction.is_a?(Hash) && interaction['type'].present? && interaction['id'].present?
        interaction_type = interaction['type']
        interaction_id = interaction['id']
        # Oppdater cachen så framtidige innsendinger blir avvist av `interaction_active_for_submission?`.
        set_active_interaction_for_session(
          presentation,
          active_session,
          interaction_type,
          interaction_id,
          accepting_answers: false
        )
      end
    end

    payload = { type: 'interactions_stopped' }
    payload[:interaction_type] = interaction_type if interaction_type
    payload[:interaction_id] = interaction_id if interaction_id

    PresentationChannel.broadcast_to(presentation, payload)
  end

  # Menti-lignende steg 2: alle ser liveboard-resultater for gjeldende lysbilde (slide_index fra klient).
  def show_liveboard(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    raw = data['slide_index']
    raw = data[:slide_index] if raw.nil?
    return if raw.nil?

    slide_index = Integer(raw)
    return if slide_index.negative?

    deactivate_all_polls(presentation)
    active_session = active_session_for_presentation(presentation)
    clear_active_interaction_for_session(presentation, active_session) if active_session

    if active_session
      update_live_state_for_session(presentation, active_session) do |state|
        state['liveboard_slide_index'] = slide_index
        state['current_slide'] ||= slide_index
      end
    end

    # Én melding: unngår at klienter prosesserer to WS-events i feil rekkefølge.
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'liveboard_started',
        slide_index: slide_index,
        clear_interactions: true
      }
    )
  end

  # Presentatør går tilbake fra resultatvisning uten å bytte lysbilde.
  def dismiss_liveboard(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    active_session = active_session_for_presentation(presentation)
    if active_session
      update_live_state_for_session(presentation, active_session) do |state|
        state['liveboard_slide_index'] = nil
      end
    end

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'liveboard_dismissed' }
    )
  end

  # Presentatør aktiverer et spørsmål på lysbildet, og sender det til alle deltakere for visning og interaksjon.
  def activate_question(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    question = find_question_in_presentation(presentation, data['question_id'])
    return unless question

    deactivate_all_polls(presentation)
    active_session = active_session_for_presentation(presentation)
    return unless active_session
    set_active_interaction_for_session(presentation, active_session, 'question', question[:id], accepting_answers: true)
    # Liveboard skal lukkes når en ny aktiv interaksjon starter.
    update_live_state_for_session(presentation, active_session) do |state|
      state['liveboard_slide_index'] = nil
    end

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'question_activated', question_id: question[:id], question: serialize_question(question) }
    )

    broadcast_question_results(presentation, active_session, question)
  end

  # Deltaker sender svar på et spørsmål, som lagres og oppdateres i sanntid for alle deltakere.
  def submit_question_response(data)
    presentation = Presentation.find(params[:presentation_id])
    active_session = active_session_for_presentation(presentation)
    return unless active_session

    question = find_question_in_presentation(presentation, data['question_id'])
    return unless question
    return unless interaction_active_for_submission?(presentation, active_session, 'question', question[:id])

    answer = data['answer'].to_s.strip
    return if answer.blank?

    if question[:type] == 'single_choice'
      valid = (question[:options] || []).map { |o| o[:text] }.include?(answer)
      return unless valid
    end

    # Lagrer svar i cache for rask tilgang og sanntidsoppdatering, og unngår duplikater basert på client_id eller user_id.
    store = question_store_for_session(active_session.id, question[:id])
    client_key = data['client_id'].presence || data[:client_id].presence || current_user.id.to_s
    if store['user_answers'].key?(client_key)
      broadcast_question_results(presentation, active_session, question)
      transmit(type: 'question_response_accepted', question_id: question[:id])
      return
    end

    store['user_answers'][client_key] = answer
    store['results'][answer] = store['results'].fetch(answer, 0) + 1
    store['total'] = store['total'].to_i + 1
    # For åpne tekst-svar, lagrer vi de siste 20 svarene for visning i liveboard-resultater.
    if question[:type] == 'open_text'
      store['recent_answers'] ||= []
      store['recent_answers'] << answer
      store['recent_answers'] = store['recent_answers'].last(20)
    end

    Rails.cache.write(question_store_key(active_session.id, question[:id]), store, expires_in: 12.hours)
    broadcast_question_results(presentation, active_session, question)
    transmit(type: 'question_response_accepted', question_id: question[:id])
  end

  # Hjelpemetode for å generere en unik cache-nøkkel for lagring av spørsmålssvar basert på presentasjons-ID, økt-ID og spørsmål-ID.
  def question_store_key(session_id, question_id)
    "presentation_session:#{params[:presentation_id]}:session:#{session_id}:question:#{question_id}"
  end

  # Hjelpemetode for å hente eller initialisere lagringsstruktur for spørsmålssvar i cache, som inkluderer resultater,
  # total antall svar, individuelle bruker-svar og nylige åpne tekst-svar.
  def question_store_for_session(session_id, question_id)
    Rails.cache.fetch(question_store_key(session_id, question_id)) do
      { 'results' => {}, 'total' => 0, 'user_answers' => {}, 'recent_answers' => [] }
    end
  end

  def poll_store_key(session_id, poll_id)
    "presentation_session:#{params[:presentation_id]}:session:#{session_id}:poll:#{poll_id}"
  end

  def poll_store_for_session(session_id, poll_id)
    Rails.cache.fetch(poll_store_key(session_id, poll_id)) do
      { 'results' => {}, 'total' => 0, 'user_answers' => {} }
    end
  end

  # Henter et spørsmål fra presentasjonen basert på ID. Bygger et cachet oppslagskart over
  # alle spørsmål i slides en gang, slik at gjentatte WS-interaksjoner ikke skanner alle slides hver gang.
  def find_question_in_presentation(presentation, question_id)
    target_id = question_id.to_s
    return nil if target_id.blank?

    lookup = Rails.cache.fetch(
      self.class.questions_lookup_cache_key(presentation.id),
      expires_in: QUESTIONS_LOOKUP_CACHE_TTL
    ) do
      build_questions_lookup(presentation)
    end

    lookup[target_id]
  end

  def build_questions_lookup(presentation)
    presentation.slides.order(:slide_index).each_with_object({}) do |slide, hash|
      payload = slide.background.is_a?(Hash) ? slide.background : {}
      questions = payload['questions'] || payload[:questions] || []
      questions.each do |q|
        qh = q.is_a?(Hash) ? q : {}
        id = (qh['id'] || qh[:id]).to_s
        next if id.blank?

        options = (qh['options'] || qh[:options] || []).map do |opt|
          oh = opt.is_a?(Hash) ? opt : {}
          { id: (oh['id'] || oh[:id]).to_s, text: (oh['text'] || oh[:text]).to_s }
        end

        hash[id] = {
          id: id,
          prompt: (qh['prompt'] || qh[:prompt]).to_s,
          type: ((qh['type'] || qh[:type]).to_s == 'single_choice' ? 'single_choice' : 'open_text'),
          options: options
        }
      end
    end
  end

  # Hjelpemetode for å formatere et spørsmål i en standard struktur for sending til klienter, inkludert ID, prompt, type og alternativer.
  def serialize_question(question)
    {
      id: question[:id],
      prompt: question[:prompt],
      type: question[:type],
      options: question[:options]
    }
  end

  # Hjelpemetode for å sende oppdaterte resultater for et spørsmål til alle deltakere i sanntid.
  def broadcast_question_results(presentation, active_session, question)
    store = question_store_for_session(active_session.id, question[:id])
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'question_results',
        question_id: question[:id],
        question_type: question[:type],
        results: store['results'] || {},
        total: store['total'] || 0,
        recent_answers: store['recent_answers'] || []
      }
    )
  end

  # Presentatør aktiverer en poll, og sender den til alle deltakere for visning og interaksjon.
  def activate_poll(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    poll = Poll.includes(:poll_options, :slide).find(data['poll_id'])
    deactivate_all_polls(presentation)
    poll.update!(is_active: true)

    active_session = active_session_for_presentation(presentation)
    return unless active_session
    set_active_interaction_for_session(presentation, active_session, 'poll', poll.id, accepting_answers: true)
    update_live_state_for_session(presentation, active_session) do |state|
      state['liveboard_slide_index'] = nil
    end

    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'poll_activated',
        poll_id: poll.id,
        poll: serialize_poll(poll, active_session)
      }
    )

    broadcast_poll_results(poll, active_session)
  end

  # Deltaker sender svar på en poll. Cache-basert flyt (samme mønster som spørsmål) for
  # instant respons. DB-skriving skjer som sekundær backup etter broadcast.
  def submit_poll_response(data)
    presentation = Presentation.find(params[:presentation_id])
    active_session = active_session_for_presentation(presentation)
    return unless active_session

    poll_id = data['poll_id'] || data[:poll_id]
    poll = Poll.includes(:poll_options).find(poll_id)
    return unless interaction_active_for_submission?(presentation, active_session, 'poll', poll.id)

    answer_text = (data['answer'] || data[:answer]).to_s.strip
    return if answer_text.blank?

    option_id = data['option_id'] || data[:option_id]
    option = if option_id.present?
               poll.poll_options.find_by(id: option_id) || poll.poll_options.find_by(text: answer_text)
             else
               poll.poll_options.find_by(text: answer_text)
             end
    return unless option

    store = poll_store_for_session(active_session.id, poll.id)
    client_key = (data['client_id'] || data[:client_id]).presence || current_user.id.to_s
    if store['user_answers'].key?(client_key)
      broadcast_poll_results(poll, active_session)
      transmit(type: 'poll_response_accepted', poll_id: poll.id)
      return
    end

    store['user_answers'][client_key] = option.text
    store['results'][option.text] = store['results'].fetch(option.text, 0) + 1
    store['total'] = store['total'].to_i + 1

    Rails.cache.write(poll_store_key(active_session.id, poll.id), store, expires_in: 12.hours)
    broadcast_poll_results(poll, active_session)
    transmit(type: 'poll_response_accepted', poll_id: poll.id)

    # Sekundær DB-backup (feiler stille — cache er autoritativ under live-økt)
    begin
      PollResponse.find_or_create_by!(
        poll_id: poll.id,
        user_id: current_user.id,
        presentation_session_id: active_session.id
      ) { |r| r.answer = option.text }
    rescue StandardError
      # Cache-basert flyt har allerede broadcastet — DB-feil påvirker ikke live-opplevelsen
    end
  end

  private

  # Nullstiller alle polls i hele presentasjonen. Bryter ikke historikken (PollResponse beholdes).
  def deactivate_all_polls(presentation)
    Poll.joins(:slide).where(slides: { presentation_id: presentation.id }).update_all(is_active: false)
  end

  def set_active_interaction_for_session(presentation, active_session, interaction_type, interaction_id, accepting_answers: true)
    Rails.cache.write(
      self.class.active_interaction_cache_key(presentation.id, active_session.id),
      {
        'type' => interaction_type.to_s,
        'id' => interaction_id.to_s,
        'accepting_answers' => accepting_answers == true
      },
      expires_in: ACTIVE_INTERACTION_CACHE_TTL
    )
  end

  def clear_active_interaction_for_session(presentation, active_session)
    Rails.cache.delete(self.class.active_interaction_cache_key(presentation.id, active_session.id))
  end

  def active_interaction_for_session(presentation, active_session)
    Rails.cache.read(self.class.active_interaction_cache_key(presentation.id, active_session.id))
  end

  def interaction_active_for_submission?(presentation, active_session, interaction_type, interaction_id)
    interaction = active_interaction_for_session(presentation, active_session)

    if interaction.is_a?(Hash)
      return interaction['type'].to_s == interaction_type.to_s &&
             interaction['id'].to_s == interaction_id.to_s &&
             interaction['accepting_answers'] == true
    end

    # Cache mangler (f.eks. en annen Puma-arbeider håndterte aktiveringen, eller TTL gikk ut).
    # I stedet for å avvise svar — som ville være tilbakefallet til den gamle implementasjonen
    # som "fungerte sjeldent" — godtar vi svaret hvis kilden i DB bekrefter at interaksjonen
    # er aktiv. Presentatør kan fortsatt eksplisitt stenge via `stop_interactions`.
    case interaction_type.to_s
    when 'poll'
      Poll.where(id: interaction_id, is_active: true).exists?
    when 'question'
      find_question_in_presentation(presentation, interaction_id).present?
    else
      false
    end
  end

  def live_state_for_session(presentation, active_session)
    Rails.cache.read(self.class.live_state_cache_key(presentation.id, active_session.id)) || {}
  end

  # Oppdaterer cachet live-state (gjeldende slide + liveboard) atomisk i forhold til kalleren.
  def update_live_state_for_session(presentation, active_session)
    key = self.class.live_state_cache_key(presentation.id, active_session.id)
    state = Rails.cache.read(key) || {}
    yield state
    Rails.cache.write(key, state, expires_in: LIVE_STATE_CACHE_TTL)
  end

  def clear_live_state_for_session(presentation, active_session)
    Rails.cache.delete(self.class.live_state_cache_key(presentation.id, active_session.id))
  end

  # Send full snapshot kun til den nye klienten (transmit, ikke broadcast). Inkluderer
  # gjeldende lysbilde, liveboard-status og aktiv interaksjon med ferdig serialisert
  # payload + siste resultater. Klienten kan da rendre korrekt med en gang og slipper
  # å vente på neste presenter-handling.
  def transmit_live_state_snapshot(presentation, active_session)
    state = live_state_for_session(presentation, active_session)
    current_slide = state['current_slide']
    liveboard_slide_index = state['liveboard_slide_index']

    interaction = active_interaction_for_session(presentation, active_session)
    interaction_payload = nil

    if interaction.is_a?(Hash) && interaction['type'].present? && interaction['id'].present?
      case interaction['type'].to_s
      when 'poll'
        poll = Poll.includes(:poll_options).find_by(id: interaction['id'])
        if poll
          store = poll_store_for_session(active_session.id, poll.id)
          interaction_payload = {
            type: 'poll',
            accepting_answers: interaction['accepting_answers'] == true,
            poll: serialize_poll(poll, active_session),
            poll_results: { results: store['results'] || {}, total: store['total'] || 0 }
          }
        end
      when 'question'
        question = find_question_in_presentation(presentation, interaction['id'])
        if question
          store = question_store_for_session(active_session.id, question[:id])
          interaction_payload = {
            type: 'question',
            accepting_answers: interaction['accepting_answers'] == true,
            question: serialize_question(question),
            question_results: {
              question_type: question[:type],
              results: store['results'] || {},
              total: store['total'] || 0,
              recent_answers: store['recent_answers'] || []
            }
          }
        end
      end
    end

    transmit(
      {
        type: 'live_state_snapshot',
        current_slide: current_slide,
        liveboard_slide_index: liveboard_slide_index,
        active_interaction: interaction_payload
      }
    )
  end

  # Cacher id-en til den aktive økten i 30 sekunder slik at hver eneste WS-interaksjon
  # ikke treffer DB for et oppslag mot presentation_sessions. Cachen blir ugyldiggjort
  # eksplisitt av kontrollere når en økt startes/avsluttes. I tillegg validerer vi alltid
  # at den cachede økten fortsatt er aktiv før den brukes videre.
  def active_session_for_presentation(presentation)
    cache_key = self.class.active_session_cache_key(presentation.id)
    cached_id = Rails.cache.fetch(cache_key, expires_in: ACTIVE_SESSION_CACHE_TTL) do
      presentation.presentation_sessions.where(ended_at: nil).pick(:id)
    end

    return nil unless cached_id

    session = PresentationSession.find_by(id: cached_id, ended_at: nil)
    unless session
      Rails.cache.delete(cache_key)
      # En ny økt kan ha blitt opprettet selv om den cachede var avsluttet.
      fresh_id = presentation.presentation_sessions.where(ended_at: nil).pick(:id)
      return nil unless fresh_id

      Rails.cache.write(cache_key, fresh_id, expires_in: ACTIVE_SESSION_CACHE_TTL)
      session = PresentationSession.find_by(id: fresh_id, ended_at: nil)
    end

    session
  end

  def poll_results_for_session(poll, active_session)
    store = poll_store_for_session(active_session.id, poll.id)
    { results: store['results'] || {}, total: store['total'] || 0 }
  end

  def broadcast_poll_results(poll, active_session)
    return unless active_session

    payload = poll_results_for_session(poll, active_session)
    PresentationChannel.broadcast_to(
      poll.slide.presentation,
      {
        type: 'poll_results',
        poll_id: poll.id,
        results: payload[:results],
        total: payload[:total]
      }
    )
  end

  def serialize_poll(poll, active_session)
    store = active_session ? poll_store_for_session(active_session.id, poll.id) : {}
    results = store['results'] || {}

    {
      id: poll.id,
      question: poll.question,
      options: poll.poll_options.map do |option|
        {
          id: option.id,
          text: option.text,
          votes: results[option.text].to_i
        }
      end
    }
  end
end
