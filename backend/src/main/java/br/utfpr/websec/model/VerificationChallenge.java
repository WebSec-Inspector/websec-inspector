package br.utfpr.websec.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name="verification_challenges")
public class VerificationChallenge {
    @Id @GeneratedValue(strategy=GenerationType.UUID)
    private UUID id;
    @ManyToOne(optional=false) @JoinColumn(name="user_id",nullable=false)
    private User user;
    @Column(nullable=false,unique=true)
    private String token;
    @OneToOne @JoinColumn(name="domain_id",unique=true)
    private Domain domain;
    @Column(name="created_at",nullable=false,updatable=false)
    private Instant createdAt=Instant.now();

    public UUID getId(){return id;}
    public User getUser(){return user;}
    public void setUser(User user){this.user=user;}
    public String getToken(){return token;}
    public void setToken(String token){this.token=token;}
    public Domain getDomain(){return domain;}
    public void setDomain(Domain domain){this.domain=domain;}
    public Instant getCreatedAt(){return createdAt;}
}
