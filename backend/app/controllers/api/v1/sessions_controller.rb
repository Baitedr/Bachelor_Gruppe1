module Api
    module V1
        class SessionsController < ApplicationController
            before_action :authenticate_user!, only: [:join, :end_session, :participants, :session_state]
            before_action :load_current_user_from_token, only: [:join_by_code]

            # POST /api/v1/sessions/guest_join
            # No auth required – creates a temporary guest user and returns a JWT.
            def guest_join
                session = PresentationSession.find_by(
                    join_code: params[:code]&.upcase,
                    ended_at: nil
                )

                unless session
                    return render json: { error: 'Ingen aktiv sesjon funnet for denne koden.' }, status: :not_found
                end

                guest_user = create_guest_user!

                SessionParticipant.create!(
                    session_id: session.id,
                    user_id: guest_user.id
                )
                broadcast_session_state(session)

                token = JsonWebToken.encode(user_id: guest_user.id, guest: true)

                render json: {
                    token: token,
                    presentation_id: session.presentation_id,
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count
                }, status: :ok
            end

            # POST /api/v1/sessions/join_by_code
            # Called by PhoneInteraction – no presentation_id needed, just the code.
            def join_by_code
                session = PresentationSession.find_by(
                    join_code: params[:code]&.upcase,
                    ended_at: nil
                )

                unless session
                    return render json: { error: 'Ingen aktiv sesjon funnet for denne koden.' }, status: :not_found
                end

                participant = @current_user || create_guest_user!
                SessionParticipant.find_or_create_by!(session_id: session.id, user_id: participant.id)
                broadcast_session_state(session)
                token = @current_user ? nil : JsonWebToken.encode(user_id: participant.id, guest: true)

                render json: {
                    message: 'Koblet til',
                    presentation_id: session.presentation_id,
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count,
                    token: token
                }, status: :ok
            end

            # POST /api/v1/presentations/:presentation_id/join
            # Called when the participant already knows the presentation_id.
            def join
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.find_by(ended_at: nil)

                unless session
                    return render json: { error: 'Ingen aktiv sesjon.' }, status: :not_found
                end

                SessionParticipant.find_or_create_by!(
                    session_id: session.id,
                    user_id: @current_user.id
                )
                broadcast_session_state(session)

                render json: {
                    message: 'Koblet til',
                    presentation: presentation.as_json(include: {
                        slides: {
                            include: {
                                polls: { include: :poll_options }
                            }
                        }
                    }),
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count
                }, status: :ok
            end

            def end_session
                presentation = Presentation.find(params[:id])

                unless presentation.owner_id == @current_user.id
                    return render json: { error: 'Unauthorized' }, status: :forbidden
                end

                session = presentation.presentation_sessions.find_by(ended_at: nil)

                if session
                    session.update!(ended_at: Time.current)
                    presentation.update!(is_live: false)
                end

                render json: {
                    session: session,
                    presentation: presentation.as_json(include: {
                        slides: {
                            include: {
                                polls: { include: :poll_options },
                                slide_elements: {}
                            }
                        }
                    })
                }
            end

            def participants
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.where(ended_at: nil).last

                if session
                    participants = session.session_participants.includes(:user)
                    render json: {
                        participants: participants.map { |p| {
                        id: p.user.id,
                        name: p.user.name,
                        email: p.user.email,
                        joined_at: p.joined_at
                    }}
                    }
                else
                    render json: { participants: [] }
                end
            end

            def session_state
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.find_by(ended_at: nil)

                if session
                    render json: {
                        session_started: session.started?,
                        session_ended: false,
                        participant_count: session.session_participants.count,
                        join_code: session.join_code
                    }, status: :ok
                else
                    render json: {
                        session_started: false,
                        session_ended: true,
                        participant_count: 0,
                        join_code: nil
                    }, status: :ok
                end
            end

            private

            def load_current_user_from_token
                auth_header = request.headers['Authorization']
                token = auth_header&.split(' ')&.last
                return if token.blank?

                decoded = JsonWebToken.decode(token)
                return unless decoded&.dig(:user_id)

                @current_user = User.find_by(id: decoded[:user_id])
            end

            def create_guest_user!
                User.create!(
                    email: "guest_#{SecureRandom.hex(6)}@guest.proslides",
                    password: build_guest_password,
                    name: 'Gjest'
                )
            end

            def build_guest_password
                # Meets User complexity validation: lowercase, uppercase, and digit.
                "Guest#{SecureRandom.alphanumeric(10)}1aA"
            end

            def broadcast_session_state(session)
                count = session.session_participants.count
                payload = {
                    participant_count: count,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?
                }

                PresentationChannel.broadcast_to(
                    session.presentation,
                    { type: 'participant_joined', count: count }
                )
                PresentationChannel.broadcast_to(
                    session.presentation,
                    { type: 'session_state' }.merge(payload)
                )
            end
        end
    end
end
