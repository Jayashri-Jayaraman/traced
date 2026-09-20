package com.traced.backend.repository;

import com.traced.backend.entity.Design;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DesignRepository extends JpaRepository<Design, Long> {
    List<Design> findByOwnerIdOrderByUpdatedAtDesc(Long ownerId);
}
